import { Injectable } from '@nestjs/common';
import { AttendanceKind, AttendanceStatus, DeviceStatus, EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async enrollmentReport(filter: { courseId?: string; batchId?: string; siteId?: string }) {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        ...(filter.courseId ? { courseId: filter.courseId } : {}),
        ...(filter.batchId ? { batchId: filter.batchId } : {}),
        ...(filter.siteId ? { student: { siteId: filter.siteId } } : {}),
      },
      include: {
        student: { select: { fullName: true, email: true, site: { select: { name: true, code: true } } } },
        course: { select: { title: true, code: true } },
        batch: { select: { name: true } },
      },
    });

    return rows.map((r) => ({
      student: r.student.fullName,
      email: r.student.email,
      site: r.student.site?.name ?? '—',
      course: r.course.title,
      courseCode: r.course.code,
      batch: r.batch?.name ?? '—',
      status: r.status,
      enrolledAt: r.enrolledAt,
      completedAt: r.completedAt,
    }));
  }

  async completionReport(courseId?: string) {
    const courses = await this.prisma.course.findMany({
      where: { ...(courseId ? { id: courseId } : {}), state: 'PUBLISHED' },
      include: {
        enrollments: { select: { status: true } },
        _count: { select: { certificates: true } },
      },
    });

    return courses.map((c) => {
      const total = c.enrollments.length;
      const completed = c.enrollments.filter((e) => e.status === EnrollmentStatus.COMPLETED).length;
      return {
        courseId: c.id,
        course: c.title,
        code: c.code,
        enrolled: total,
        completed,
        completionPct: total ? Math.round((completed / total) * 100) : 0,
        certificatesIssued: c._count.certificates,
      };
    });
  }

  async attendanceReport(filter: { from?: Date; to?: Date; courseId?: string; siteId?: string }) {
    const records = await this.prisma.attendance.findMany({
      where: {
        kind: AttendanceKind.INDIVIDUAL,
        ...(filter.from || filter.to
          ? { date: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
          : {}),
        ...(filter.courseId ? { session: { courseId: filter.courseId } } : {}),
        ...(filter.siteId ? { student: { siteId: filter.siteId } } : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, site: { select: { name: true } } } },
      },
    });

    const byStudent = new Map<string, { name: string; site: string; present: number; total: number }>();
    for (const r of records) {
      if (!r.student) continue;
      const row = byStudent.get(r.student.id) ?? {
        name: r.student.fullName,
        site: r.student.site?.name ?? '—',
        present: 0,
        total: 0,
      };
      row.total += 1;
      if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) row.present += 1;
      byStudent.set(r.student.id, row);
    }

    return [...byStudent.entries()].map(([studentId, row]) => ({
      studentId,
      ...row,
      percentage: row.total ? Math.round((row.present / row.total) * 100) : 0,
    }));
  }

  async assessmentReport(courseId?: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { ...(courseId ? { quiz: { courseId } } : {}), status: { in: ['GRADED', 'AUTO_SUBMITTED'] } },
      include: {
        quiz: { select: { id: true, title: true, passMark: true } },
        student: { select: { fullName: true } },
        _count: { select: { proctorFlags: true } },
      },
    });

    const byQuiz = new Map<string, { title: string; attempts: number; passed: number; scores: number[]; flagged: number }>();
    for (const a of attempts) {
      const row = byQuiz.get(a.quiz.id) ?? { title: a.quiz.title, attempts: 0, passed: 0, scores: [], flagged: 0 };
      row.attempts += 1;
      if (a.passed) row.passed += 1;
      if (a.score !== null && a.maxScore) row.scores.push((a.score / a.maxScore) * 100);
      if (a._count.proctorFlags > 0) row.flagged += 1;
      byQuiz.set(a.quiz.id, row);
    }

    return [...byQuiz.entries()].map(([quizId, row]) => ({
      quizId,
      quiz: row.title,
      attempts: row.attempts,
      passed: row.passed,
      passPct: row.attempts ? Math.round((row.passed / row.attempts) * 100) : 0,
      averageScorePct: row.scores.length
        ? Math.round(row.scores.reduce((a, b) => a + b, 0) / row.scores.length)
        : 0,
      attemptsWithIntegrityFlags: row.flagged,
    }));
  }

  /**
   * Site-wise utilization — the report the department needs for GeM/AMC
   * reporting: sessions held, attendance and device uptime per site (§5.13).
   */
  async siteUtilization(from?: Date, to?: Date) {
    const range = from || to ? { gte: from, lte: to } : undefined;

    const sites = await this.prisma.site.findMany({
      where: { active: true },
      include: {
        classrooms: {
          include: {
            devices: { select: { status: true } },
            broadcastTargets: {
              where: range ? { session: { scheduledStart: range } } : {},
              select: { id: true, connectionOk: true },
            },
            roomAttendance: {
              where: range ? { date: range } : {},
              select: { headcount: true, status: true },
            },
          },
        },
        users: { where: { role: 'STUDENT' }, select: { id: true } },
      },
      orderBy: { code: 'asc' },
    });

    return sites.map((site) => {
      const devices = site.classrooms.flatMap((c) => c.devices);
      const relays = site.classrooms.flatMap((c) => c.broadcastTargets);
      const attendance = site.classrooms.flatMap((c) => c.roomAttendance);
      const online = devices.filter((d) => d.status === DeviceStatus.ONLINE).length;

      return {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        district: site.district,
        classrooms: site.classrooms.length,
        students: site.users.length,
        sessionsReceived: relays.length,
        sessionsDegraded: relays.filter((r) => !r.connectionOk).length,
        roomSessionsMarked: attendance.length,
        avgHeadcount: attendance.length
          ? Math.round(attendance.reduce((s, a) => s + (a.headcount ?? 0), 0) / attendance.length)
          : 0,
        devicesTotal: devices.length,
        devicesOnline: online,
        deviceUptimePct: devices.length ? Math.round((online / devices.length) * 100) : 0,
      };
    });
  }

  /**
   * What each teacher is carrying: the classes they are in charge of, the
   * subjects they teach, and how many learners that adds up to. An academic
   * office allocates work from this, and it is the one view that shows a
   * teacher with nothing assigned.
   */
  async teacherWorkload(siteId?: string) {
    const teachers = await this.prisma.user.findMany({
      where: { role: 'TEACHER', status: 'ACTIVE', ...(siteId ? { siteId } : {}) },
      select: {
        id: true,
        fullName: true,
        email: true,
        site: { select: { name: true } },
        classesInCharge: { select: { id: true, name: true } },
        subjectsTaught: {
          select: {
            course: { select: { id: true, title: true } },
            class: { select: { id: true, name: true } },
          },
        },
        taughtCourses: {
          select: { course: { select: { id: true, title: true, _count: { select: { enrollments: true } } } } },
        },
        hostedSessions: { where: { status: { in: ['SCHEDULED', 'LIVE'] } }, select: { id: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    return teachers.map((t) => {
      const courseIds = new Set(t.taughtCourses.map((c) => c.course.id));
      const learners = t.taughtCourses.reduce((sum, c) => sum + c.course._count.enrollments, 0);

      return {
        teacherId: t.id,
        teacher: t.fullName,
        email: t.email,
        site: t.site?.name ?? '—',
        classTeacherOf: t.classesInCharge.map((c) => c.name).join(', ') || '—',
        classesInCharge: t.classesInCharge.length,
        subjects: [...new Set(t.subjectsTaught.map((s) => s.course.title))].join(', ') || '—',
        subjectCount: courseIds.size,
        classSubjectCount: t.subjectsTaught.length,
        learners,
        upcomingSessions: t.hostedSessions.length,
      };
    });
  }

  async activityReport(days = 30) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const [logins, submissions, attempts, sessions] = await Promise.all([
      this.prisma.user.count({ where: { lastLoginAt: { gte: since } } }),
      this.prisma.submission.count({ where: { submittedAt: { gte: since } } }),
      this.prisma.quizAttempt.count({ where: { startedAt: { gte: since } } }),
      this.prisma.liveSession.count({ where: { scheduledStart: { gte: since } } }),
    ]);
    return { days, activeUsers: logins, submissions, quizAttempts: attempts, liveSessions: sessions };
  }

  /** Converts any report row set to CSV for the export buttons. */
  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
    ].join('\n');
  }
}
