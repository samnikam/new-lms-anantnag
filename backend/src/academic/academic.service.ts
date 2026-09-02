import { BadRequestException, Injectable } from '@nestjs/common';
import { EnrollmentAction, EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AcademicService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────── Academic years ───────────────────────

  listYears() {
    return this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { batches: true } } },
    });
  }

  async createYear(data: { name: string; startDate: Date; endDate: Date; isCurrent?: boolean }) {
    if (data.endDate <= data.startDate) {
      throw new BadRequestException('End date must be after the start date.');
    }
    if (data.isCurrent) {
      await this.prisma.academicYear.updateMany({ data: { isCurrent: false }, where: { isCurrent: true } });
    }
    return this.prisma.academicYear.create({ data });
  }

  async setCurrentYear(id: string) {
    await this.prisma.academicYear.updateMany({ data: { isCurrent: false }, where: { isCurrent: true } });
    return this.prisma.academicYear.update({ where: { id }, data: { isCurrent: true } });
  }

  // ───────────────────────────  Batches ───────────────────────────

  listBatches(filter: { academicYearId?: string; siteId?: string }) {
    return this.prisma.batch.findMany({
      where: {
        ...(filter.academicYearId ? { academicYearId: filter.academicYearId } : {}),
        ...(filter.siteId ? { siteId: filter.siteId } : {}),
      },
      include: {
        academicYear: { select: { name: true } },
        site: { select: { id: true, name: true, code: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  createBatch(data: Prisma.BatchUncheckedCreateInput) {
    return this.prisma.batch.create({ data });
  }

  updateBatch(id: string, data: Prisma.BatchUncheckedUpdateInput) {
    return this.prisma.batch.update({ where: { id }, data });
  }

  // ────────────────────────  Enrollments ────────────────────────

  listEnrollments(filter: { courseId?: string; studentId?: string; batchId?: string }) {
    return this.prisma.enrollment.findMany({
      where: filter,
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true, code: true } },
        batch: { select: { id: true, name: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  async enroll(studentId: string, courseId: string, batchId?: string, actorId?: string) {
    await this.assertPrerequisitesMet(studentId, courseId);

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });

    const enrollment = await this.prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId, batchId },
      update: { status: EnrollmentStatus.ACTIVE, batchId },
    });

    await this.prisma.enrollmentHistory.create({
      data: {
        enrollmentId: enrollment.id,
        action: existing ? EnrollmentAction.REINSTATED : EnrollmentAction.ENROLLED,
        fromStatus: existing?.status,
        toStatus: EnrollmentStatus.ACTIVE,
        fromBatchId: existing?.batchId,
        toBatchId: batchId,
        changedById: actorId,
      },
    });

    return enrollment;
  }

  /**
   * Moves a learner to another batch, keeping the trail. The previous batch,
   * the reason and the actor are all retained (§17).
   */
  async transferEnrollment(
    id: string,
    toBatchId: string,
    reason: string | undefined,
    actorId: string,
  ) {
    const current = await this.prisma.enrollment.findUniqueOrThrow({ where: { id } });
    if (current.batchId === toBatchId) {
      throw new BadRequestException('The learner is already in that batch.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id },
        data: { batchId: toBatchId, status: EnrollmentStatus.ACTIVE },
      }),
      this.prisma.enrollmentHistory.create({
        data: {
          enrollmentId: id,
          action: current.batchId ? EnrollmentAction.TRANSFERRED : EnrollmentAction.BATCH_CHANGED,
          fromBatchId: current.batchId,
          toBatchId,
          fromStatus: current.status,
          toStatus: EnrollmentStatus.ACTIVE,
          reason,
          changedById: actorId,
        },
      }),
    ]);
    return updated;
  }

  /** Withdraws a learner without deleting the record, so history survives. */
  async withdrawEnrollment(id: string, reason: string | undefined, actorId: string) {
    const current = await this.prisma.enrollment.findUniqueOrThrow({ where: { id } });

    const [updated] = await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id },
        data: { status: EnrollmentStatus.WITHDRAWN },
      }),
      this.prisma.enrollmentHistory.create({
        data: {
          enrollmentId: id,
          action: EnrollmentAction.WITHDRAWN,
          fromStatus: current.status,
          toStatus: EnrollmentStatus.WITHDRAWN,
          fromBatchId: current.batchId,
          reason,
          changedById: actorId,
        },
      }),
    ]);
    return updated;
  }

  enrollmentHistory(id: string) {
    return this.prisma.enrollmentHistory.findMany({
      where: { enrollmentId: id },
      orderBy: { at: 'desc' },
    });
  }

  /** Bulk enrol a whole batch into a course in one transaction. */
  async enrollBatch(batchId: string, courseId: string) {
    const students = await this.prisma.enrollment.findMany({
      where: { batchId },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    if (students.length === 0) {
      throw new BadRequestException('This batch has no students to enrol yet.');
    }
    const result = await this.prisma.enrollment.createMany({
      data: students.map((s) => ({ studentId: s.studentId, courseId, batchId })),
      skipDuplicates: true,
    });
    return { enrolled: result.count };
  }

  /** Enrol an explicit list of students (used by the admin enrolment screen). */
  async enrollMany(studentIds: string[], courseId: string, batchId?: string) {
    const result = await this.prisma.enrollment.createMany({
      data: studentIds.map((studentId) => ({ studentId, courseId, batchId })),
      skipDuplicates: true,
    });
    return { enrolled: result.count };
  }

  async setEnrollmentStatus(id: string, status: EnrollmentStatus, actorId?: string) {
    const current = await this.prisma.enrollment.findUniqueOrThrow({ where: { id } });

    const [updated] = await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id },
        data: {
          status,
          completedAt: status === EnrollmentStatus.COMPLETED ? new Date() : null,
        },
      }),
      this.prisma.enrollmentHistory.create({
        data: {
          enrollmentId: id,
          action:
            status === EnrollmentStatus.WITHDRAWN
              ? EnrollmentAction.WITHDRAWN
              : status === EnrollmentStatus.COMPLETED
                ? EnrollmentAction.COMPLETED
                : EnrollmentAction.REINSTATED,
          fromStatus: current.status,
          toStatus: status,
          changedById: actorId,
        },
      }),
    ]);
    return updated;
  }

  private async assertPrerequisitesMet(studentId: string, courseId: string) {
    const prereqs = await this.prisma.coursePrerequisite.findMany({
      where: { courseId },
      include: { prerequisite: { select: { id: true, title: true } } },
    });
    if (prereqs.length === 0) return;

    const completed = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        courseId: { in: prereqs.map((p) => p.prereqId) },
        status: EnrollmentStatus.COMPLETED,
      },
      select: { courseId: true },
    });
    const done = new Set(completed.map((c) => c.courseId));
    const missing = prereqs.filter((p) => !done.has(p.prereqId));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Prerequisite not completed: ${missing.map((m) => m.prerequisite.title).join(', ')}`,
      );
    }
  }
}
