import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  list(filter: { courseId?: string; batchId?: string; studentId?: string }) {
    return this.prisma.assignment.findMany({
      where: {
        ...(filter.courseId ? { courseId: filter.courseId } : {}),
        ...(filter.batchId ? { batchId: filter.batchId } : {}),
        ...(filter.studentId
          ? { published: true, course: { enrollments: { some: { studentId: filter.studentId } } } }
          : {}),
      },
      include: {
        course: { select: { id: true, title: true, code: true } },
        ...(filter.studentId
          ? { submissions: { where: { studentId: filter.studentId } } }
          : { _count: { select: { submissions: true } } }),
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.assignment.findUniqueOrThrow({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        submissions: {
          include: { student: { select: { id: true, fullName: true, email: true } } },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
  }

  create(data: Prisma.AssignmentUncheckedCreateInput) {
    return this.prisma.assignment.create({ data });
  }

  update(id: string, data: Prisma.AssignmentUncheckedUpdateInput) {
    return this.prisma.assignment.update({ where: { id }, data });
  }

  async publish(id: string) {
    const assignment = await this.prisma.assignment.update({
      where: { id },
      data: { published: true },
      include: { course: { select: { title: true } } },
    });

    const students = await this.prisma.enrollment.findMany({
      where: { courseId: assignment.courseId, status: 'ACTIVE' },
      select: { studentId: true },
    });

    await this.notifications.notifyMany(students.map((s) => s.studentId), {
      type: 'ASSIGNMENT_PUBLISHED',
      title: `New assignment: ${assignment.title}`,
      body: `Due ${assignment.dueAt.toLocaleString('en-IN')} — ${assignment.course.title}`,
      link: `/assignments/${assignment.id}`,
    });

    return assignment;
  }

  /** Student submission. Late submissions are accepted only if the rule allows. */
  async submit(
    assignmentId: string,
    studentId: string,
    payload: { text?: string; fileKey?: string; fileName?: string },
  ) {
    const assignment = await this.prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    if (!assignment.published) throw new BadRequestException('This assignment is not open yet.');

    const enrolled = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: assignment.courseId } },
    });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course.');

    const now = new Date();
    const isLate = now > assignment.dueAt;
    if (isLate && !assignment.allowLate) {
      throw new BadRequestException('The due date has passed and late submissions are not accepted.');
    }
    if (!payload.text && !payload.fileKey) {
      throw new BadRequestException('Attach a file or enter your answer before submitting.');
    }

    const existing = await this.prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
    });

    return this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      create: {
        assignmentId,
        studentId,
        text: payload.text,
        fileKey: payload.fileKey,
        fileName: payload.fileName,
        submittedAt: now,
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
      },
      update: {
        text: payload.text,
        fileKey: payload.fileKey,
        fileName: payload.fileName,
        submittedAt: now,
        // A resubmission after grading restarts the review, keeping the history.
        status:
          existing?.status === SubmissionStatus.RETURNED
            ? SubmissionStatus.RESUBMITTED
            : isLate
              ? SubmissionStatus.LATE
              : SubmissionStatus.SUBMITTED,
        attempt: existing ? existing.attempt + 1 : 1,
        marks: null,
        gradedAt: null,
      },
    });
  }

  async grade(
    submissionId: string,
    gradedById: string,
    payload: { marks: number; feedback?: string; returnForRework?: boolean },
  ) {
    const submission = await this.prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { assignment: true },
    });

    if (payload.marks < 0 || payload.marks > submission.assignment.maxMarks) {
      throw new BadRequestException(`Marks must be between 0 and ${submission.assignment.maxMarks}.`);
    }

    // Apply the configured late penalty at grading time.
    let marks = payload.marks;
    if (submission.status === SubmissionStatus.LATE && submission.assignment.latePenaltyPct > 0) {
      marks = Math.max(0, marks * (1 - submission.assignment.latePenaltyPct / 100));
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        marks,
        feedback: payload.feedback,
        gradedById,
        gradedAt: new Date(),
        status: payload.returnForRework ? SubmissionStatus.RETURNED : SubmissionStatus.GRADED,
      },
    });

    await this.notifications.notifyStudentAndGuardians(submission.studentId, {
      type: 'ASSIGNMENT_GRADED',
      title: payload.returnForRework ? 'Assignment returned for revision' : 'Assignment graded',
      body: `${submission.assignment.title}: ${marks}/${submission.assignment.maxMarks}`,
      link: `/assignments/${submission.assignmentId}`,
    });

    return updated;
  }

  mySubmissions(studentId: string) {
    return this.prisma.submission.findMany({
      where: { studentId },
      include: {
        assignment: {
          select: { id: true, title: true, dueAt: true, maxMarks: true, course: { select: { title: true } } },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
