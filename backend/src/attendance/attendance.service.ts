import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceKind, AttendanceStatus, Prisma } from '@prisma/client';
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
      ...(courseId ? { session: { courseId } } : {}),
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
