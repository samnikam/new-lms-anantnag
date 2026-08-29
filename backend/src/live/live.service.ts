import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceKind,
  AttendanceStatus,
  Role,
  SessionMode,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ZoomService } from './zoom.service';

const CLASSROOM_PUBLIC = {
  id: true,
  name: true,
  code: true,
  siteId: true,
  isStudio: true,
  capacity: true,
} as const;

@Injectable()
export class LiveService {
  constructor(
    private prisma: PrismaService,
    private zoom: ZoomService,
  ) {}

  /**
   * Schedules a session. In BROADCAST mode the session originates from one of
   * the two studio rooms and relays to a list of target classrooms — scheduled
   * once, not joined room by room (§3B.2).
   */
  async schedule(
    input: {
      title: string;
      description?: string;
      courseId?: string;
      batchId?: string;
      mode: SessionMode;
      originRoomId?: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      targetClassroomIds?: string[];
      moderatedQA?: boolean;
      createZoomMeeting?: boolean;
    },
    host: AuthUser,
  ) {
    if (input.scheduledEnd <= input.scheduledStart) {
      throw new BadRequestException('The session must end after it starts.');
    }

    if (input.mode === SessionMode.BROADCAST) {
      if (!input.originRoomId) {
        throw new BadRequestException('A broadcast must originate from a studio room.');
      }
      const studio = await this.prisma.classroom.findUnique({ where: { id: input.originRoomId } });
      if (!studio?.isStudio) {
        throw new BadRequestException('The origin room is not configured as a broadcast studio.');
      }
      if (!input.targetClassroomIds?.length) {
        throw new BadRequestException('Select at least one target classroom for the broadcast.');
      }
      await this.assertStudioFree(input.originRoomId, input.scheduledStart, input.scheduledEnd);
      await this.assertRoomsFree(input.targetClassroomIds, input.scheduledStart, input.scheduledEnd);
    }

    const meeting = input.createZoomMeeting
      ? await this.zoom.createMeeting({
          topic: input.title,
          startTime: input.scheduledStart,
          durationMin: Math.round(
            (+input.scheduledEnd - +input.scheduledStart) / 60000,
          ),
        })
      : null;

    const session = await this.prisma.liveSession.create({
      data: {
        title: input.title,
        description: input.description,
        courseId: input.courseId,
        batchId: input.batchId,
        hostId: host.id,
        mode: input.mode,
        originRoomId: input.originRoomId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        moderatedQA: input.moderatedQA ?? true,
        zoomMeetingId: meeting?.id,
        zoomJoinUrl: meeting?.joinUrl,
        zoomStartUrl: meeting?.startUrl,
        streamUrl: input.mode === SessionMode.BROADCAST ? meeting?.streamUrl ?? null : null,
        targets: input.targetClassroomIds?.length
          ? { create: input.targetClassroomIds.map((classroomId) => ({ classroomId })) }
          : undefined,
      },
      include: { targets: { include: { classroom: { select: CLASSROOM_PUBLIC } } } },
    });

    // Mirror the session onto the academic calendar.
    await this.prisma.calendarEvent.create({
      data: {
        title: input.title,
        type: 'CLASS',
        startAt: input.scheduledStart,
        endAt: input.scheduledEnd,
        courseId: input.courseId,
        batchId: input.batchId,
        sessionId: session.id,
        createdById: host.id,
      },
    });

    return session;
  }

  /**
   * Studio double-booking check (§5.6). With only two studios in the bid, an
   * overlapping booking is a real scheduling conflict, not a warning.
   */
  private async assertStudioFree(originRoomId: string, start: Date, end: Date, exceptId?: string) {
    const clash = await this.prisma.liveSession.findFirst({
      where: {
        id: exceptId ? { not: exceptId } : undefined,
        originRoomId,
        status: { in: [SessionStatus.SCHEDULED, SessionStatus.LIVE] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: { id: true, title: true, scheduledStart: true },
    });
    if (clash) {
      throw new BadRequestException(
        `This studio is already booked for "${clash.title}" at that time.`,
      );
    }
  }

  /** A classroom panel can only receive one broadcast at a time. */
  private async assertRoomsFree(classroomIds: string[], start: Date, end: Date, exceptId?: string) {
    const clash = await this.prisma.broadcastTarget.findFirst({
      where: {
        classroomId: { in: classroomIds },
        session: {
          id: exceptId ? { not: exceptId } : undefined,
          status: { in: [SessionStatus.SCHEDULED, SessionStatus.LIVE] },
          scheduledStart: { lt: end },
          scheduledEnd: { gt: start },
        },
      },
      include: { classroom: { select: { name: true, code: true } }, session: { select: { title: true } } },
    });
    if (clash) {
      throw new BadRequestException(
        `${clash.classroom.name} (${clash.classroom.code}) is already receiving "${clash.session.title}" at that time.`,
      );
    }
  }

  async list(filter: {
    from?: Date;
    to?: Date;
    courseId?: string;
    status?: SessionStatus;
    classroomId?: string;
    user: AuthUser;
  }) {
    const { user } = filter;
    const where: any = {
      ...(filter.courseId ? { courseId: filter.courseId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? { scheduledStart: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
      ...(filter.classroomId ? { targets: { some: { classroomId: filter.classroomId } } } : {}),
    };

    // Students see only sessions for courses they are enrolled in.
    if (user.role === Role.STUDENT) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { studentId: user.id, status: 'ACTIVE' },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    }
    if (user.role === Role.TEACHER) {
      where.OR = [
        { hostId: user.id },
        { course: { teachers: { some: { teacherId: user.id } } } },
      ];
    }

    return this.prisma.liveSession.findMany({
      where,
      include: {
        course: { select: { id: true, title: true, code: true } },
        host: { select: { id: true, fullName: true } },
        originRoom: { select: { id: true, name: true, code: true } },
        targets: { include: { classroom: { select: { id: true, name: true, code: true, siteId: true } } } },
        _count: { select: { attendance: true } },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true, code: true } },
        host: { select: { id: true, fullName: true } },
        originRoom: true,
        targets: {
          include: {
            classroom: {
              select: { ...CLASSROOM_PUBLIC, site: { select: { id: true, name: true, code: true } } },
            },
          },
        },
        questions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!session) throw new NotFoundException('Session not found.');
    return session;
  }

  async updateTargets(sessionId: string, classroomIds: string[]) {
    const session = await this.prisma.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('A completed session cannot be re-targeted.');
    }
    await this.assertRoomsFree(classroomIds, session.scheduledStart, session.scheduledEnd, sessionId);

    return this.prisma.$transaction(async (tx) => {
      await tx.broadcastTarget.deleteMany({ where: { sessionId } });
      await tx.broadcastTarget.createMany({
        data: classroomIds.map((classroomId) => ({ sessionId, classroomId })),
        skipDuplicates: true,
      });
      return tx.liveSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { targets: { include: { classroom: { select: CLASSROOM_PUBLIC } } } },
      });
    });
  }

  async start(id: string, hostId: string) {
    const session = await this.prisma.liveSession.findUniqueOrThrow({ where: { id } });
    if (session.hostId !== hostId) {
      throw new ForbiddenException('Only the scheduled host can start this session.');
    }
    return this.prisma.liveSession.update({
      where: { id },
      data: { status: SessionStatus.LIVE, actualStart: new Date() },
    });
  }

  /**
   * Ends the session and links the studio recording to every classroom and
   * course that was scheduled to receive the broadcast, for catch-up (§3B.2).
   */
  async end(id: string, recordingUrl?: string) {
    const session = await this.prisma.liveSession.findUniqueOrThrow({
      where: { id },
      include: { targets: true },
    });

    const updated = await this.prisma.liveSession.update({
      where: { id },
      data: {
        status: SessionStatus.COMPLETED,
        actualEnd: new Date(),
        recordingUrl: recordingUrl ?? session.recordingUrl,
      },
    });

    if (updated.recordingUrl && session.courseId) {
      // Park the recording in the course as a reusable resource.
      const firstModule = await this.prisma.module.findFirst({
        where: { courseId: session.courseId },
        orderBy: { position: 'asc' },
        include: { lessons: { orderBy: { position: 'asc' }, take: 1 } },
      });
      const lessonId = firstModule?.lessons[0]?.id;
      if (lessonId) {
        await this.prisma.resource.create({
          data: {
            lessonId,
            title: `Recording — ${session.title}`,
            type: 'VIDEO',
            url: updated.recordingUrl,
            state: 'PUBLISHED',
            inLibrary: true,
          },
        });
      }
    }

    return updated;
  }

  cancel(id: string) {
    return this.prisma.liveSession.update({
      where: { id },
      data: { status: SessionStatus.CANCELLED },
    });
  }

  /**
   * Join payload for one endpoint. A kiosk panel gets the relay stream; a
   * personal device gets the Zoom join URL. If the site link has dropped, the
   * caller is handed the fallback recording instead of a dead stream (§5.5).
   */
  async join(id: string, user: AuthUser) {
    const session = await this.findOne(id);

    if (user.kioskClassroomId) {
      const target = session.targets.find((t) => t.classroomId === user.kioskClassroomId);
      if (!target) {
        throw new ForbiddenException('This classroom is not a target of the session.');
      }
      await this.prisma.broadcastTarget.update({
        where: { id: target.id },
        data: { joinedAt: new Date() },
      });
    } else if (user.role === Role.STUDENT && session.courseId) {
      const enrolled = await this.prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId: user.id, courseId: session.courseId } },
      });
      if (!enrolled) throw new ForbiddenException('You are not enrolled in this course.');
    }

    const degraded = session.status === SessionStatus.FALLBACK_RECORDED;
    return {
      sessionId: session.id,
      title: session.title,
      mode: session.mode,
      status: session.status,
      moderatedQA: session.moderatedQA,
      // Kiosk panels consume the relay; individuals join the meeting.
      url: degraded
        ? session.fallbackAssetUrl ?? session.recordingUrl
        : user.kioskClassroomId
          ? session.streamUrl ?? session.zoomJoinUrl
          : session.zoomJoinUrl ?? session.streamUrl,
      degraded,
      message: degraded
        ? 'The live link is unavailable at this site. Playing the recorded session instead.'
        : null,
    };
  }

  /** Reported by a classroom agent when its uplink fails mid-broadcast. */
  async reportConnectionLoss(sessionId: string, classroomId: string) {
    await this.prisma.broadcastTarget.updateMany({
      where: { sessionId, classroomId },
      data: { connectionOk: false, leftAt: new Date() },
    });

    const session = await this.prisma.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
    return {
      fallbackUrl: session.fallbackAssetUrl ?? session.recordingUrl,
      message: 'Switched this classroom to the queued recording.',
    };
  }

  // ───────────────────── Moderated classroom Q&A ─────────────────────

  askQuestion(sessionId: string, body: string, user: AuthUser) {
    return this.prisma.sessionQuestion.create({
      data: {
        sessionId,
        body,
        classroomId: user.kioskClassroomId ?? undefined,
        askedById: user.kioskClassroomId ? undefined : user.id,
      },
    });
  }

  moderateQuestion(questionId: string, approved: boolean) {
    return this.prisma.sessionQuestion.update({
      where: { id: questionId },
      data: { approved, answeredAt: approved ? null : new Date() },
    });
  }

  listQuestions(sessionId: string, onlyApproved: boolean) {
    return this.prisma.sessionQuestion.findMany({
      where: { sessionId, ...(onlyApproved ? { approved: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The day's schedule for a kiosk panel — what it auto-opens on boot. */
  async todayForClassroom(classroomId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.prisma.liveSession.findMany({
      where: {
        targets: { some: { classroomId } },
        scheduledStart: { gte: start, lt: end },
        status: { not: SessionStatus.CANCELLED },
      },
      include: { course: { select: { title: true, code: true } }, host: { select: { fullName: true } } },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  /**
   * Room-level attendance for a shared-panel session (§3B.1). Recorded by the
   * facilitator present, stored alongside — never instead of — individual marks.
   */
  async markRoomAttendance(
    sessionId: string,
    classroomId: string,
    headcount: number,
    markedById: string | null,
    remarks?: string,
  ) {
    const target = await this.prisma.broadcastTarget.findUnique({
      where: { sessionId_classroomId: { sessionId, classroomId } },
    });
    if (!target) throw new BadRequestException('This classroom was not a target of the session.');

    const existing = await this.prisma.attendance.findFirst({
      where: { sessionId, classroomId, kind: AttendanceKind.ROOM_LEVEL },
    });

    const data = {
      sessionId,
      classroomId,
      kind: AttendanceKind.ROOM_LEVEL,
      status: headcount > 0 ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
      headcount,
      markedById,
      remarks,
    };

    return existing
      ? this.prisma.attendance.update({ where: { id: existing.id }, data })
      : this.prisma.attendance.create({ data });
  }
}
