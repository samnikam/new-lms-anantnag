import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AttemptStatus,
  Prisma,
  ProctorFlagType,
  QuestionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class QuizService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ───────────────────────── Question bank ─────────────────────────

  listQuestions(filter: { courseId?: string; topic?: string; type?: QuestionType }) {
    return this.prisma.question.findMany({
      where: filter,
      include: { options: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  createQuestion(data: {
    courseId?: string;
    topic?: string;
    type: QuestionType;
    body: string;
    marks?: number;
    negativeMarks?: number;
    explanation?: string;
    difficulty?: string;
    options?: Array<{ body: string; isCorrect: boolean }>;
  }) {
    const { options = [], ...rest } = data;
    if (isObjective(data.type) && !options.some((o) => o.isCorrect)) {
      throw new BadRequestException('Mark at least one option as correct.');
    }
    return this.prisma.question.create({
      data: {
        ...rest,
        options: { create: options.map((o, position) => ({ ...o, position })) },
      },
      include: { options: true },
    });
  }

  async updateQuestion(
    id: string,
    data: Partial<{ body: string; marks: number; explanation: string; difficulty: string; options: Array<{ body: string; isCorrect: boolean }> }>,
  ) {
    const { options, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (options) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        await tx.questionOption.createMany({
          data: options.map((o, position) => ({ ...o, questionId: id, position })),
        });
      }
      return tx.question.update({
        where: { id },
        data: rest,
        include: { options: { orderBy: { position: 'asc' } } },
      });
    });
  }

  deleteQuestion(id: string) {
    return this.prisma.question.delete({ where: { id } });
  }

  // ───────────────────────────── Quizzes ─────────────────────────────

  listQuizzes(filter: { courseId?: string; publishedOnly?: boolean }) {
    return this.prisma.quiz.findMany({
      where: {
        ...(filter.courseId ? { courseId: filter.courseId } : {}),
        ...(filter.publishedOnly ? { published: true } : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createQuiz(data: Prisma.QuizUncheckedCreateInput) {
    return this.prisma.quiz.create({ data });
  }

  updateQuiz(id: string, data: Prisma.QuizUncheckedUpdateInput) {
    return this.prisma.quiz.update({ where: { id }, data });
  }

  async setQuestions(quizId: string, items: Array<{ questionId: string; marks?: number }>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.deleteMany({ where: { quizId } });
      await tx.quizQuestion.createMany({
        data: items.map((item, position) => ({ ...item, quizId, position })),
      });
      return tx.quiz.findUniqueOrThrow({
        where: { id: quizId },
        include: { questions: { include: { question: true } } },
      });
    });
  }

  async publishQuiz(id: string) {
    const count = await this.prisma.quizQuestion.count({ where: { quizId: id } });
    if (count === 0) throw new BadRequestException('Add questions before publishing this quiz.');
    return this.prisma.quiz.update({ where: { id }, data: { published: true } });
  }

  // ──────────────────────────── Attempts ────────────────────────────

  /**
   * Starts an attempt. Correct answers are never included in the payload sent
   * to the learner — options are stripped down to id and body only.
   */
  async startAttempt(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      include: { questions: { include: { question: { include: { options: true } } }, orderBy: { position: 'asc' } } },
    });

    if (!quiz.published) throw new BadRequestException('This quiz is not open.');

    const now = new Date();
    if (quiz.opensAt && now < quiz.opensAt) throw new BadRequestException('This quiz has not opened yet.');
    if (quiz.closesAt && now > quiz.closesAt) throw new BadRequestException('This quiz has closed.');

    const enrolled = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course.');

    const previous = await this.prisma.quizAttempt.findMany({
      where: { quizId, studentId },
      orderBy: { attemptNo: 'desc' },
    });

    const live = previous.find((a) => a.status === AttemptStatus.IN_PROGRESS && a.expiresAt > now);
    if (live) return this.attemptPayload(live.id, quiz);

    if (previous.length >= quiz.maxAttempts) {
      throw new BadRequestException(`You have used all ${quiz.maxAttempts} attempt(s) for this quiz.`);
    }

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        studentId,
        attemptNo: previous.length + 1,
        expiresAt: new Date(now.getTime() + quiz.durationMin * 60_000),
      },
    });

    return this.attemptPayload(attempt.id, quiz);
  }

  private async attemptPayload(attemptId: string, quiz: any) {
    const attempt = await this.prisma.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { answers: true },
    });

    let questions = quiz.questions.map((qq: any) => ({
      questionId: qq.question.id,
      type: qq.question.type,
      body: qq.question.body,
      marks: qq.marks ?? qq.question.marks,
      // Correct flags are deliberately omitted.
      options: qq.question.options.map((o: any) => ({ id: o.id, body: o.body })),
      selectedIds: attempt.answers.find((a) => a.questionId === qq.question.id)?.selectedIds ?? [],
      textAnswer: attempt.answers.find((a) => a.questionId === qq.question.id)?.textAnswer ?? '',
    }));

    if (quiz.shuffleQuestions) questions = shuffle(questions);
    if (quiz.shuffleOptions) questions = questions.map((q: any) => ({ ...q, options: shuffle(q.options) }));

    return {
      attemptId: attempt.id,
      quizId: quiz.id,
      title: quiz.title,
      durationMin: quiz.durationMin,
      expiresAt: attempt.expiresAt,
      lockTimer: quiz.lockTimer,
      proctoringEnabled: quiz.proctoringEnabled,
      maxTabSwitches: quiz.maxTabSwitches,
      questions,
    };
  }

  /** Autosave a single answer while the attempt is running. */
  async saveAnswer(
    attemptId: string,
    studentId: string,
    payload: { questionId: string; selectedIds?: string[]; textAnswer?: string },
  ) {
    const attempt = await this.assertOwnLiveAttempt(attemptId, studentId);

    await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: payload.questionId } },
      create: {
        attemptId: attempt.id,
        questionId: payload.questionId,
        selectedIds: payload.selectedIds ?? [],
        textAnswer: payload.textAnswer,
      },
      update: { selectedIds: payload.selectedIds ?? [], textAnswer: payload.textAnswer },
    });
    return { saved: true };
  }

  /**
   * Records an integrity event. Exceeding the configured tab-switch budget
   * auto-submits the attempt (§5.8 exam-integrity controls).
   */
  async flag(attemptId: string, studentId: string, type: ProctorFlagType, detail?: string) {
    const attempt = await this.assertOwnLiveAttempt(attemptId, studentId);
    await this.prisma.proctorFlag.create({ data: { attemptId, type, detail } });

    const quiz = await this.prisma.quiz.findUniqueOrThrow({ where: { id: attempt.quizId } });
    const switches = await this.prisma.proctorFlag.count({
      where: { attemptId, type: { in: [ProctorFlagType.TAB_SWITCH, ProctorFlagType.WINDOW_BLUR] } },
    });

    if (quiz.proctoringEnabled && switches > quiz.maxTabSwitches) {
      await this.submitAttempt(attemptId, studentId, true);
      return { autoSubmitted: true, switches, message: 'Attempt submitted: too many window switches.' };
    }
    return { autoSubmitted: false, switches, remaining: Math.max(0, quiz.maxTabSwitches - switches) };
  }

  /** Grades objective questions automatically; flags the rest for manual review. */
  async submitAttempt(attemptId: string, studentId: string, auto = false) {
    const attempt = await this.prisma.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        answers: true,
        quiz: { include: { questions: { include: { question: { include: { options: true } } } } } },
      },
    });
    if (attempt.studentId !== studentId) throw new ForbiddenException('This is not your attempt.');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This attempt has already been submitted.');
    }

    let score = 0;
    let maxScore = 0;
    let needsReview = false;

    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const qq of attempt.quiz.questions) {
      const question = qq.question;
      const weight = qq.marks ?? question.marks;
      maxScore += weight;

      const answer = attempt.answers.find((a) => a.questionId === question.id);
      if (!answer) continue;

      if (isObjective(question.type)) {
        const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id).sort();
        const chosen = [...answer.selectedIds].sort();
        const isCorrect =
          correctIds.length === chosen.length && correctIds.every((id, i) => id === chosen[i]);

        const awarded = isCorrect ? weight : -question.negativeMarks;
        score += awarded;

        updates.push(
          this.prisma.attemptAnswer.update({
            where: { id: answer.id },
            data: { isCorrect, awardedMarks: awarded },
          }),
        );
      } else {
        needsReview = true;
        updates.push(
          this.prisma.attemptAnswer.update({
            where: { id: answer.id },
            data: { needsManualReview: true },
          }),
        );
      }
    }

    score = Math.max(0, score);
    const passed = maxScore > 0 ? (score / maxScore) * 100 >= attempt.quiz.passMark : false;

    await this.prisma.$transaction([
      ...updates,
      this.prisma.quizAttempt.update({
        where: { id: attemptId },
        data: {
          status: needsReview
            ? AttemptStatus.SUBMITTED
            : auto
              ? AttemptStatus.AUTO_SUBMITTED
              : AttemptStatus.GRADED,
          submittedAt: new Date(),
          score,
          maxScore,
          passed: needsReview ? null : passed,
        },
      }),
    ]);

    if (!needsReview && attempt.quiz.resultsPublished) {
      await this.notifications.notifyStudentAndGuardians(studentId, {
        type: 'QUIZ_RESULT',
        title: `Result published: ${attempt.quiz.title}`,
        body: `Score ${score}/${maxScore} — ${passed ? 'Passed' : 'Not passed'}`,
        link: `/quizzes/${attempt.quizId}/results`,
      });
    }

    return {
      attemptId,
      score,
      maxScore,
      passed: needsReview ? null : passed,
      awaitingManualReview: needsReview,
      resultVisible: attempt.quiz.resultsPublished,
    };
  }

  /** Teacher marks a subjective answer that automatic grading could not score. */
  async reviewAnswer(answerId: string, awardedMarks: number) {
    const answer = await this.prisma.attemptAnswer.update({
      where: { id: answerId },
      data: { awardedMarks, needsManualReview: false, isCorrect: awardedMarks > 0 },
      include: { attempt: { include: { quiz: true } } },
    });

    const pending = await this.prisma.attemptAnswer.count({
      where: { attemptId: answer.attemptId, needsManualReview: true },
    });
    if (pending > 0) return answer;

    // All manual marking done — finalise the attempt score.
    const all = await this.prisma.attemptAnswer.findMany({ where: { attemptId: answer.attemptId } });
    const score = Math.max(0, all.reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0));
    const maxScore = answer.attempt.maxScore ?? 0;

    return this.prisma.quizAttempt.update({
      where: { id: answer.attemptId },
      data: {
        score,
        status: AttemptStatus.GRADED,
        passed: maxScore > 0 ? (score / maxScore) * 100 >= answer.attempt.quiz.passMark : false,
      },
    });
  }

  publishResults(quizId: string) {
    return this.prisma.quiz.update({ where: { id: quizId }, data: { resultsPublished: true } });
  }

  async attemptHistory(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({ where: { id: quizId } });
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId, studentId },
      include: { proctorFlags: true, _count: { select: { answers: true } } },
      orderBy: { attemptNo: 'asc' },
    });

    // Results stay hidden until the teacher publishes them.
    return attempts.map((a) => ({
      ...a,
      score: quiz.resultsPublished ? a.score : null,
      passed: quiz.resultsPublished ? a.passed : null,
    }));
  }

  quizResults(quizId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { quizId },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        proctorFlags: true,
        answers: { where: { needsManualReview: true }, include: { question: true } },
      },
      orderBy: { score: 'desc' },
    });
  }

  private async assertOwnLiveAttempt(attemptId: string, studentId: string) {
    const attempt = await this.prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (attempt.studentId !== studentId) throw new ForbiddenException('This is not your attempt.');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This attempt is closed.');
    }
    if (attempt.expiresAt < new Date()) {
      throw new BadRequestException('Time is up for this attempt.');
    }
    return attempt;
  }
}

function isObjective(type: QuestionType) {
  return (
    type === QuestionType.MCQ_SINGLE ||
    type === QuestionType.MCQ_MULTI ||
    type === QuestionType.TRUE_FALSE
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
