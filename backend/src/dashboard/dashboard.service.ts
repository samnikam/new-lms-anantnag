import { Injectable } from '@nestjs/common';
import { DeviceStatus, EnrollmentStatus, Role, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { AttendanceService } from '../attendance/attendance.service';
import { ProgressService } from '../progress/progress.service';
import { ReportsService } from '../reports/reports.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private attendance: AttendanceService,
    private progress: ProgressService,
    private reports: ReportsService,
    private users: UsersService,
  ) {}

  /** Routes to the right role dashboard; each role sees only its own data. */
  async forUser(user: AuthUser) {
    switch (user.role) {
      case Role.SUPER_ADMIN:
        return this.superAdmin();
      case Role.ACADEMIC_ADMIN:
        return this.academicAdmin();
      case Role.TEACHER:
        return this.teacher(user.id);
      case Role.STUDENT:
        return this.student(user.id);
      case Role.PARENT:
        return this.parent(user.id);
      case Role.CONTENT_MANAGER:
        return this.contentManager();
      case Role.DEPT_OVERSIGHT:
        return this.oversight();
      default:
        return {};
    }
  }

  private async superAdmin() {
    const [users, courses, sessions, devices, tickets, activity] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true, where: { status: 'ACTIVE' } }),
      this.prisma.course.groupBy({ by: ['state'], _count: true }),
      this.prisma.liveSession.count({ where: { status: SessionStatus.SCHEDULED } }),
      this.prisma.device.groupBy({ by: ['status'], _count: true }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'ESCALATED'] } } }),
      this.reports.activityReport(30),
    ]);

    const recentAudit = await this.prisma.auditLog.findMany({
      include: { actor: { select: { fullName: true, role: true } } },
      orderBy: { at: 'desc' },
      take: 10,
    });

    return {
      role: Role.SUPER_ADMIN,
      usersByRole: Object.fromEntries(users.map((u) => [u.role, u._count])),
      coursesByState: Object.fromEntries(courses.map((c) => [c.state, c._count])),
      upcomingSessions: sessions,
      devices: {
        online: devices.find((d) => d.status === DeviceStatus.ONLINE)?._count ?? 0,
        offline: devices.find((d) => d.status === DeviceStatus.OFFLINE)?._count ?? 0,
      },
      openTickets: tickets,
      activity,
      recentAudit,
    };
  }

  private async academicAdmin() {
    const [batches, enrollments, completion, upcoming, pendingLinks] = await Promise.all([
      this.prisma.batch.count({ where: { active: true } }),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.ACTIVE } }),
      this.reports.completionReport(),
      this.upcomingSessions(),
      this.prisma.parentStudentLink.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      role: Role.ACADEMIC_ADMIN,
      activeBatches: batches,
      activeEnrollments: enrollments,
      courseCompletion: completion.slice(0, 10),
      upcomingSessions: upcoming,
      pendingParentLinks: pendingLinks,
    };
  }

  private async teacher(teacherId: string) {
    const courses = await this.prisma.course.findMany({
      where: { teachers: { some: { teacherId } } },
      include: { _count: { select: { enrollments: true } } },
    });

    const courseIds = courses.map((c) => c.id);
    const [upcoming, ungraded, pendingReview] = await Promise.all([
      this.prisma.liveSession.findMany({
        where: { hostId: teacherId, status: SessionStatus.SCHEDULED, scheduledStart: { gte: new Date() } },
        include: { course: { select: { title: true } }, targets: { select: { id: true } } },
        orderBy: { scheduledStart: 'asc' },
        take: 5,
      }),
      this.prisma.submission.count({
        where: { assignment: { courseId: { in: courseIds } }, status: { in: ['SUBMITTED', 'LATE', 'RESUBMITTED'] } },
      }),
      this.prisma.attemptAnswer.count({
        where: { needsManualReview: true, attempt: { quiz: { courseId: { in: courseIds } } } },
      }),
    ]);

    return {
      role: Role.TEACHER,
      myCourses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        code: c.code,
        state: c.state,
        learners: c._count.enrollments,
      })),
      totalLearners: courses.reduce((sum, c) => sum + c._count.enrollments, 0),
      upcomingSessions: upcoming,
      submissionsToGrade: ungraded,
      answersAwaitingReview: pendingReview,
    };
  }

  private async student(studentId: string) {
    const [courses, attendance, upcoming, dueSoon, certificates, unread] = await Promise.all([
      this.progress.myCourses(studentId),
      this.attendance.studentSummary(studentId),
      this.upcomingSessionsForStudent(studentId),
      this.prisma.assignment.findMany({
        where: {
          published: true,
          dueAt: { gte: new Date() },
          course: { enrollments: { some: { studentId } } },
          submissions: { none: { studentId, status: { in: ['SUBMITTED', 'GRADED', 'LATE'] } } },
        },
        include: { course: { select: { title: true } } },
        orderBy: { dueAt: 'asc' },
        take: 5,
      }),
      this.prisma.certificate.count({ where: { studentId, revokedAt: null } }),
      this.prisma.notification.count({ where: { userId: studentId, readAt: null, channel: 'IN_APP' } }),
    ]);

    const resume = courses
      .filter((c) => c.completionPct > 0 && c.completionPct < 100)
      .sort((a, b) => b.completionPct - a.completionPct)[0];

    return {
      role: Role.STUDENT,
      courses,
      overallCompletionPct: courses.length
        ? Math.round(courses.reduce((s, c) => s + c.completionPct, 0) / courses.length)
        : 0,
      attendancePct: attendance.percentage,
      upcomingSessions: upcoming,
      assignmentsDue: dueSoon,
      certificates,
      unreadNotifications: unread,
      resumeCourse: resume ?? courses[0] ?? null,
    };
  }

  /** Guardian view — strictly read-only, and only for approved links. */
  private async parent(parentId: string) {
    const children = await this.users.childrenOf(parentId);

    const detail = await Promise.all(
      children.map(async (child) => {
        const [courses, attendance, results, upcoming] = await Promise.all([
          this.progress.myCourses(child.id),
          this.attendance.studentSummary(child.id),
          this.prisma.submission.findMany({
            where: { studentId: child.id, marks: { not: null } },
            include: { assignment: { select: { title: true, maxMarks: true } } },
            orderBy: { gradedAt: 'desc' },
            take: 5,
          }),
          this.upcomingSessionsForStudent(child.id),
        ]);

        return {
          student: { id: child.id, fullName: child.fullName },
          completionPct: courses.length
            ? Math.round(courses.reduce((s, c) => s + c.completionPct, 0) / courses.length)
            : 0,
          attendancePct: attendance.percentage,
          courses,
          recentResults: results,
          upcomingSessions: upcoming,
        };
      }),
    );

    return { role: Role.PARENT, children: detail };
  }

  private async contentManager() {
    const [byState, resources, recent] = await Promise.all([
      this.prisma.course.groupBy({ by: ['state'], _count: true }),
      this.prisma.resource.count({ where: { inLibrary: true } }),
      this.prisma.course.findMany({
        where: { state: 'IN_REVIEW' },
        select: { id: true, title: true, code: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      role: Role.CONTENT_MANAGER,
      coursesByState: Object.fromEntries(byState.map((c) => [c.state, c._count])),
      libraryResources: resources,
      awaitingReview: recent,
    };
  }

  /**
   * Department / buyer oversight: site rollups and device status only — no
   * drill-down into any individual student record (§4).
   */
  private async oversight() {
    const [utilization, completion, activity, tickets] = await Promise.all([
      this.reports.siteUtilization(),
      this.reports.completionReport(),
      this.reports.activityReport(30),
      this.prisma.supportTicket.groupBy({ by: ['status'], _count: true }),
    ]);

    const totals = utilization.reduce(
      (acc, s) => ({
        classrooms: acc.classrooms + s.classrooms,
        students: acc.students + s.students,
        devicesOnline: acc.devicesOnline + s.devicesOnline,
        devicesTotal: acc.devicesTotal + s.devicesTotal,
        sessions: acc.sessions + s.sessionsReceived,
      }),
      { classrooms: 0, students: 0, devicesOnline: 0, devicesTotal: 0, sessions: 0 },
    );

    return {
      role: Role.DEPT_OVERSIGHT,
      sites: utilization,
      totals: {
        ...totals,
        siteCount: utilization.length,
        uptimePct: totals.devicesTotal
          ? Math.round((totals.devicesOnline / totals.devicesTotal) * 100)
          : 0,
      },
      averageCompletionPct: completion.length
        ? Math.round(completion.reduce((s, c) => s + c.completionPct, 0) / completion.length)
        : 0,
      activity,
      ticketsByStatus: Object.fromEntries(tickets.map((t) => [t.status, t._count])),
    };
  }

  private upcomingSessions() {
    return this.prisma.liveSession.findMany({
      where: { status: SessionStatus.SCHEDULED, scheduledStart: { gte: new Date() } },
      include: {
        course: { select: { title: true } },
        host: { select: { fullName: true } },
        targets: { select: { id: true } },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 8,
    });
  }

  private async upcomingSessionsForStudent(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: EnrollmentStatus.ACTIVE },
      select: { courseId: true },
    });

    return this.prisma.liveSession.findMany({
      where: {
        courseId: { in: enrollments.map((e) => e.courseId) },
        status: { in: [SessionStatus.SCHEDULED, SessionStatus.LIVE] },
        scheduledEnd: { gte: new Date() },
      },
      include: { course: { select: { title: true } }, host: { select: { fullName: true } } },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
    });
  }
}
