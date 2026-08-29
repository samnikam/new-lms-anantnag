import { Injectable } from '@nestjs/common';
import { AttemptStatus, EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private certificates: CertificatesService,
  ) {}

  /**
   * Records lesson progress from the course player. Completing the last
   * required lesson triggers the completion check, which may issue a certificate.
   */
  async track(
    studentId: string,
    input: { courseId: string; lessonId: string; completed?: boolean; secondsSpent?: number; lastPositionSec?: number },
  ) {
    const existing = await this.prisma.progress.findUnique({
      where: { studentId_lessonId: { studentId, lessonId: input.lessonId } },
    });

    const record = await this.prisma.progress.upsert({
      where: { studentId_lessonId: { studentId, lessonId: input.lessonId } },
      create: {
        studentId,
        courseId: input.courseId,
        lessonId: input.lessonId,
        completed: input.completed ?? false,
        secondsSpent: input.secondsSpent ?? 0,
        lastPositionSec: input.lastPositionSec ?? 0,
        completedAt: input.completed ? new Date() : null,
      },
      update: {
        // Completion is sticky: re-watching a lesson never un-completes it.
        completed: input.completed || existing?.completed || false,
        secondsSpent: (existing?.secondsSpent ?? 0) + (input.secondsSpent ?? 0),
        lastPositionSec: input.lastPositionSec ?? existing?.lastPositionSec ?? 0,
        completedAt: input.completed && !existing?.completed ? new Date() : existing?.completedAt,
      },
    });

    if (input.completed) {
      await this.evaluateCompletion(studentId, input.courseId);
    }
    return record;
  }

  /** Course-level progress for one learner: lessons, quizzes and assignments. */
  async courseSummary(studentId: string, courseId: string) {
    const [course, progress, quizzes, attempts, assignments, submissions] = await Promise.all([
      this.prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        include: { modules: { include: { lessons: { where: { state: 'PUBLISHED' } } } } },
      }),
      this.prisma.progress.findMany({ where: { studentId, courseId } }),
      this.prisma.quiz.findMany({ where: { courseId, published: true } }),
      this.prisma.quizAttempt.findMany({
        where: { studentId, quiz: { courseId }, status: { in: [AttemptStatus.GRADED, AttemptStatus.AUTO_SUBMITTED] } },
      }),
      this.prisma.assignment.findMany({ where: { courseId, published: true } }),
      this.prisma.submission.findMany({ where: { studentId, assignment: { courseId } } }),
    ]);

    const lessons = course.modules.flatMap((m) => m.lessons);
    const completedLessons = progress.filter((p) => p.completed).length;
    const lessonPct = lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0;

    const passedQuizzes = attempts.filter((a) => a.passed).length;
    const quizPct = quizzes.length ? Math.round((passedQuizzes / quizzes.length) * 100) : 100;

    const bestScores = attempts.reduce<Record<string, number>>((acc, a) => {
      acc[a.quizId] = Math.max(acc[a.quizId] ?? 0, a.score ?? 0);
      return acc;
    }, {});

    return {
      courseId,
      title: course.title,
      lessonsTotal: lessons.length,
      lessonsCompleted: completedLessons,
      lessonPct,
      quizzesTotal: quizzes.length,
      quizzesPassed: passedQuizzes,
      quizPct,
      assignmentsTotal: assignments.length,
      assignmentsSubmitted: submissions.filter((s) => s.submittedAt).length,
      assignmentsGraded: submissions.filter((s) => s.marks !== null).length,
      averageAssignmentScore: average(submissions.map((s) => s.marks).filter((m): m is number => m !== null)),
      bestQuizScores: bestScores,
      timeSpentMin: Math.round(progress.reduce((sum, p) => sum + p.secondsSpent, 0) / 60),
      eligibleForCertificate:
        lessonPct >= course.requiredLessonPct && quizPct >= course.requiredQuizPct,
    };
  }

  /** Every enrolled course for one learner — the student dashboard list. */
  async myCourses(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] } },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            code: true,
            category: true,
            thumbnailUrl: true,
            modules: { select: { lessons: { where: { state: 'PUBLISHED' }, select: { id: true } } } },
          },
        },
      },
    });

    const progress = await this.prisma.progress.findMany({ where: { studentId, completed: true } });
    const completedByCourse = progress.reduce<Record<string, number>>((acc, p) => {
      acc[p.courseId] = (acc[p.courseId] ?? 0) + 1;
      return acc;
    }, {});

    return enrollments.map((e) => {
      const total = e.course.modules.flatMap((m) => m.lessons).length;
      const done = completedByCourse[e.course.id] ?? 0;
      return {
        enrollmentId: e.id,
        status: e.status,
        courseId: e.course.id,
        title: e.course.title,
        code: e.course.code,
        category: e.course.category,
        thumbnailUrl: e.course.thumbnailUrl,
        lessonsTotal: total,
        lessonsCompleted: done,
        completionPct: total ? Math.round((done / total) * 100) : 0,
      };
    });
  }

  /** Teacher view: how a whole cohort is tracking on one course. */
  async cohortProgress(courseId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: EnrollmentStatus.ACTIVE },
      include: { student: { select: { id: true, fullName: true, email: true } } },
    });

    return Promise.all(
      enrollments.map(async (e) => ({
        student: e.student,
        ...(await this.courseSummary(e.studentId, courseId)),
      })),
    );
  }

  /**
   * Applies the course completion rules and issues a certificate the moment a
   * learner qualifies (§6.6).
   */
  private async evaluateCompletion(studentId: string, courseId: string) {
    const summary = await this.courseSummary(studentId, courseId);
    if (!summary.eligibleForCertificate) return;

    await this.prisma.enrollment.updateMany({
      where: { studentId, courseId, status: EnrollmentStatus.ACTIVE },
      data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
    });

    await this.certificates.issue(studentId, courseId).catch(() => undefined);
  }
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}
