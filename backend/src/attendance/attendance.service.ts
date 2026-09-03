import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceKind, AttendanceStatus, EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Below this attendance percentage, guardians are alerted (§5.9, §6.5). */
export const ATTENDANCE_ALERT_THRESHOLD = 75;

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Everything scheduled on a given day that attendance can be taken for:
   * broadcast sessions and ordinary timetable periods alike. Without this the
   * page can only reach live sessions, and a normal class period — which is
   * most of the timetable — has nowhere to record attendance.
   */
  async dayRegister(date: Date, siteId?: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [sessions, events] = await Promise.all([
      this.prisma.liveSession.findMany({
        where: {
          scheduledStart: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
        },
        include: {
          course: { select: { id: true, title: true } },
          batch: { select: { id: true, name: true } },
          _count: { select: { attendance: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          startAt: { gte: start, lt: end },
          // Session-backed entries are already covered above.
          sessionId: null,
          type: { in: ['CLASS', 'EXAM'] },
          ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
        },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const eventIds = events.map((e) => e.id);
    const marks = eventIds.length
      ? await this.prisma.attendance.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventIds } },
          _count: true,
        })
      : [];
    const markedByEvent = Object.fromEntries(marks.map((m) => [m.eventId, m._count]));

    // Names for the timetable entries, so the list reads as a school day.
    const courseIds = [...new Set(events.map((e) => e.courseId).filter(Boolean))] as string[];
    const classIds = [...new Set(events.map((e) => e.classId).filter(Boolean))] as string[];
    const batchIds = [...new Set(events.map((e) => e.batchId).filter(Boolean))] as string[];

    const [courses, classes, batches] = await Promise.all([
      courseIds.length ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }) : [],
      classIds.length ? this.prisma.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }) : [],
      batchIds.length ? this.prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true } }) : [],
    ]);
    const byId = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
    const c = byId(courses), k = byId(classes), b = byId(batches);

    return [
      ...sessions.map((s) => ({
        kind: 'session' as const,
        id: s.id,
        title: s.title,
        startAt: s.scheduledStart,
        endAt: s.scheduledEnd,
        course: s.course,
        group: s.batch?.name ?? null,
        status: s.status,
        marked: s._count.attendance,
      })),
      ...events.map((e) => ({
        kind: 'event' as const,
        id: e.id,
        title: e.title,
        startAt: e.startAt,
        endAt: e.endAt,
        course: e.courseId ? c[e.courseId] ?? null : null,
        group: e.batchId ? b[e.batchId]?.name ?? null : e.classId ? k[e.classId]?.name ?? null : null,
        status: e.type,
        marked: markedByEvent[e.id] ?? 0,
      })),
    ].sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt));
  }

  /**
   * The roster for a timetable period. Learners come from the class, the
   * section or the subject the entry names — whichever it was scheduled for.
   */
  async eventRoster(eventId: string) {
    const event = await this.prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });

    const where: Prisma.EnrollmentWhereInput = { status: EnrollmentStatus.ACTIVE };
    if (event.batchId) where.batchId = event.batchId;
    else if (event.classId) where.batch = { classId: event.classId };
    else if (event.courseId) where.courseId = event.courseId;
    else return { event, individual: [], rooms: [] };

    if (event.courseId && !where.courseId) where.courseId = event.courseId;

    const enrollments = await this.prisma.enrollment.findMany({
      where,
      include: { student: { select: { id: true, fullName: true, email: true } } },
      distinct: ['studentId'],
    });

    const marked = await this.prisma.attendance.findMany({ where: { eventId } });
    const byStudent = new Map(marked.filter((m) => m.studentId).map((m) => [m.studentId, m]));

    return {
      event: { id: event.id, title: event.title, start: event.startAt, type: event.type },
      individual: enrollments.map((e) => ({
        studentId: e.student.id,
        fullName: e.student.fullName,
        status: byStudent.get(e.student.id)?.status ?? null,
        remarks: byStudent.get(e.student.id)?.remarks ?? null,
      })),
      rooms: [],
    };
  }

  /** Marks a timetable period, mirroring the session roster behaviour. */
  async markEvent(
    eventId: string,
    entries: Array<{ studentId: string; status: AttendanceStatus; remarks?: string }>,
    markedById: string,
  ) {
    if (entries.length === 0) throw new BadRequestException('No attendance entries supplied.');
    const event = await this.prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });

    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { eventId_studentId: { eventId, studentId: e.studentId } },
          create: {
            eventId,
            studentId: e.studentId,
            status: e.status,
            remarks: e.remarks,
            markedById,
            kind: AttendanceKind.INDIVIDUAL,
            date: event.startAt,
          },
          update: { status: e.status, remarks: e.remarks, markedById },
        }),
      ),
    );

    for (const entry of entries) {
      if (entry.status === AttendanceStatus.ABSENT) {
        await this.checkThresholdAndAlert(entry.studentId);
      }
    }
    return { marked: entries.length };
  }

  /** Teacher marks a whole session roster in one call. */
  async markSession(
    sessionId: string,
    entries: Array<{ studentId: string; status: AttendanceStatus; remarks?: string }>,
    markedById: string,
  ) {
    if (entries.length === 0) throw new BadRequestException('No attendance entries supplied.');

    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: e.studentId } },
          create: {
            sessionId,
            studentId: e.studentId,
            status: e.status,
            remarks: e.remarks,
            markedById,
            kind: AttendanceKind.INDIVIDUAL,
          },
          update: { status: e.status, remarks: e.remarks, markedById },
        }),
      ),
    );

    // Alert guardians of anyone who has now dropped below the threshold.
    for (const entry of entries) {
      if (entry.status === AttendanceStatus.ABSENT) {
        await this.checkThresholdAndAlert(entry.studentId);
      }
    }

    return { marked: entries.length };
  }

  /**
   * Correcting a mark is a privileged action: the previous value, the reason
   * and the actor are all retained (§5.9 audit trail).
   */
  async correct(
    attendanceId: string,
    toStatus: AttendanceStatus,
    reason: string,
    correctedBy: string,
  ) {
    const record = await this.prisma.attendance.findUniqueOrThrow({ where: { id: attendanceId } });
    if (record.status === toStatus) {
      throw new BadRequestException('The attendance status is already set to that value.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.attendance.update({ where: { id: attendanceId }, data: { status: toStatus } }),
      this.prisma.attendanceCorrection.create({
        data: { attendanceId, fromStatus: record.status, toStatus, reason, correctedBy },
      }),
    ]);
    return updated;
  }

  list(filter: {
    studentId?: string;
    sessionId?: string;
    classroomId?: string;
    kind?: AttendanceKind;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.AttendanceWhereInput = {
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
      ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
      ...(filter.classroomId ? { classroomId: filter.classroomId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.from || filter.to
        ? { date: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
    };

    return this.prisma.attendance.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true } },
        classroom: { select: { id: true, name: true, code: true } },
        session: { select: { id: true, title: true, scheduledStart: true } },
        event: { select: { id: true, title: true, startAt: true } },
        corrections: true,
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  /** The roster a teacher marks against, pre-filled with anything already saved. */
  async sessionRoster(sessionId: string) {
    const session = await this.prisma.liveSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { targets: { include: { classroom: { select: { id: true, name: true, code: true } } } } },
    });

    const students = session.courseId
      ? await this.prisma.enrollment.findMany({
          where: {
            courseId: session.courseId,
            status: 'ACTIVE',
            ...(session.batchId ? { batchId: session.batchId } : {}),
          },
          include: { student: { select: { id: true, fullName: true, email: true } } },
        })
      : [];

    const marked = await this.prisma.attendance.findMany({ where: { sessionId } });
    const byStudent = new Map(marked.filter((m) => m.studentId).map((m) => [m.studentId, m]));
    const byRoom = new Map(marked.filter((m) => m.classroomId).map((m) => [m.classroomId, m]));

    return {
      session: { id: session.id, title: session.title, mode: session.mode, start: session.scheduledStart },
      individual: students.map((e) => ({
        studentId: e.student.id,
        fullName: e.student.fullName,
        status: byStudent.get(e.student.id)?.status ?? null,
        remarks: byStudent.get(e.student.id)?.remarks ?? null,
      })),
      rooms: session.targets.map((t) => ({
        classroomId: t.classroom.id,
        name: t.classroom.name,
        code: t.classroom.code,
        headcount: byRoom.get(t.classroom.id)?.headcount ?? null,
        status: byRoom.get(t.classroom.id)?.status ?? null,
      })),
    };
  }

  /** Attendance percentage for a student, optionally scoped to one course. */
  async studentSummary(studentId: string, courseId?: string) {
    const where: Prisma.AttendanceWhereInput = {
      studentId,
      kind: AttendanceKind.INDIVIDUAL,
      ...(courseId
        ? { OR: [{ session: { courseId } }, { event: { courseId } }] }
        : {}),
    };

    const records = await this.prisma.attendance.findMany({
      where,
      select: { status: true, date: true },
      orderBy: { date: 'desc' },
    });

    const present = records.filter(
      (r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE,
    ).length;

    return {
      total: records.length,
      present,
      absent: records.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      percentage: records.length ? Math.round((present / records.length) * 100) : 0,
      recent: records.slice(0, 30),
    };
  }

  /** Site-wise attendance rollup for the department oversight dashboard. */
  async siteSummary(from?: Date, to?: Date) {
    const rooms = await this.prisma.attendance.findMany({
      where: {
        kind: AttendanceKind.ROOM_LEVEL,
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { classroom: { include: { site: { select: { id: true, name: true, code: true } } } } },
    });

    const bySite = new Map<string, { siteId: string; siteName: string; siteCode: string; sessions: number; headcount: number }>();
    for (const r of rooms) {
      const site = r.classroom?.site;
      if (!site) continue;
      const row = bySite.get(site.id) ?? {
        siteId: site.id,
        siteName: site.name,
        siteCode: site.code,
        sessions: 0,
        headcount: 0,
      };
      row.sessions += 1;
      row.headcount += r.headcount ?? 0;
      bySite.set(site.id, row);
    }

    return [...bySite.values()].map((row) => ({
      ...row,
      avgHeadcount: row.sessions ? Math.round(row.headcount / row.sessions) : 0,
    }));
  }

  private async checkThresholdAndAlert(studentId: string) {
    const summary = await this.studentSummary(studentId);
    if (summary.total < 5 || summary.percentage >= ATTENDANCE_ALERT_THRESHOLD) return;

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true },
    });

    await this.notifications.notifyStudentAndGuardians(studentId, {
      type: 'ATTENDANCE_ALERT',
      title: 'Attendance below the required level',
      body: `${student?.fullName ?? 'The student'} is at ${summary.percentage}% attendance, below the ${ATTENDANCE_ALERT_THRESHOLD}% requirement.`,
      link: '/attendance',
      alsoSms: true, // critical alert — reaches guardians without data access
    });
  }
}
