import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentState, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PageQuery, pageResult, paginate } from '../common/pagination';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async list(q: PageQuery & { state?: ContentState; category?: string }, user: AuthUser) {
    const where: Prisma.CourseWhereInput = {
      ...(q.state ? { state: q.state } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search ? { OR: [
        { title: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search, mode: 'insensitive' } },
      ] } : {}),
    };

    // Students and parents only ever see published courses.
    if (user.role === Role.STUDENT || user.role === Role.PARENT) {
      where.state = ContentState.PUBLISHED;
    }
    // Teachers default to their own assignments unless they ask for the catalogue.
    if (user.role === Role.TEACHER && !q.search) {
      where.teachers = { some: { teacherId: user.id } };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: {
          teachers: { include: { teacher: { select: { id: true, fullName: true } } } },
          _count: { select: { enrollments: true, modules: true } },
        },
        orderBy: { updatedAt: 'desc' },
        ...paginate(q),
      }),
      this.prisma.course.count({ where }),
    ]);
    return pageResult(items, total, q);
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
              include: { resources: { orderBy: { position: 'asc' } } },
            },
          },
        },
        teachers: { include: { teacher: { select: { id: true, fullName: true, email: true } } } },
        prerequisites: { include: { prerequisite: { select: { id: true, title: true, code: true } } } },
        _count: { select: { enrollments: true, quizzes: true, assignments: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found.');
    return course;
  }

  create(data: Prisma.CourseUncheckedCreateInput) {
    return this.prisma.course.create({ data });
  }

  update(id: string, data: Prisma.CourseUncheckedUpdateInput) {
    return this.prisma.course.update({ where: { id }, data });
  }

  /**
   * Content workflow: DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED.
   * Publishing requires at least one lesson so students never land on an empty course.
   */
  async setState(id: string, state: ContentState) {
    if (state === ContentState.PUBLISHED) {
      const lessons = await this.prisma.lesson.count({ where: { module: { courseId: id } } });
      if (lessons === 0) {
        throw new BadRequestException('Add at least one lesson before publishing this course.');
      }
    }
    return this.prisma.course.update({
      where: { id },
      data: { state, publishedAt: state === ContentState.PUBLISHED ? new Date() : null },
    });
  }

  /** Deep-clone a course into a new DRAFT version (§5.3 clone/version support). */
  async clone(id: string, newCode: string) {
    const source = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          code: newCode,
          title: `${source.title} (copy)`,
          description: source.description,
          category: source.category,
          level: source.level,
          objectives: source.objectives,
          durationHours: source.durationHours,
          state: ContentState.DRAFT,
          version: source.version + 1,
          clonedFromId: source.id,
          requiredLessonPct: source.requiredLessonPct,
          requiredQuizPct: source.requiredQuizPct,
          passMark: source.passMark,
        },
      });

      for (const mod of source.modules) {
        const created = await tx.module.create({
          data: {
            courseId: course.id,
            title: mod.title,
            description: mod.description,
            position: mod.position,
          },
        });
        for (const lesson of mod.lessons) {
          const newLesson = await tx.lesson.create({
            data: {
              moduleId: created.id,
              title: lesson.title,
              content: lesson.content,
              position: lesson.position,
              durationMin: lesson.durationMin,
              isRequired: lesson.isRequired,
              state: ContentState.DRAFT,
            },
          });
          if (lesson.resources.length) {
            await tx.resource.createMany({
              data: lesson.resources.map((r) => ({
                lessonId: newLesson.id,
                title: r.title,
                type: r.type,
                url: r.url,
                fileKey: r.fileKey,
                mimeType: r.mimeType,
                sizeBytes: r.sizeBytes,
                position: r.position,
                isDownloadable: r.isDownloadable,
                state: ContentState.DRAFT,
              })),
            });
          }
        }
      }
      return course;
    });
  }

  assignTeacher(courseId: string, teacherId: string, isLead = false) {
    return this.prisma.courseTeacher.upsert({
      where: { courseId_teacherId: { courseId, teacherId } },
      create: { courseId, teacherId, isLead },
      update: { isLead },
    });
  }

  removeTeacher(courseId: string, teacherId: string) {
    return this.prisma.courseTeacher.delete({
      where: { courseId_teacherId: { courseId, teacherId } },
    });
  }

  // ─────────────────── Modules, lessons, resources ───────────────────

  createModule(data: Prisma.ModuleUncheckedCreateInput) {
    return this.prisma.module.create({ data });
  }

  updateModule(id: string, data: Prisma.ModuleUncheckedUpdateInput) {
    return this.prisma.module.update({ where: { id }, data });
  }

  deleteModule(id: string) {
    return this.prisma.module.delete({ where: { id } });
  }

  createLesson(data: Prisma.LessonUncheckedCreateInput) {
    return this.prisma.lesson.create({ data });
  }

  updateLesson(id: string, data: Prisma.LessonUncheckedUpdateInput) {
    return this.prisma.lesson.update({ where: { id }, data });
  }

  deleteLesson(id: string) {
    return this.prisma.lesson.delete({ where: { id } });
  }

  /** Persist a drag-and-drop reorder in one transaction. */
  reorderLessons(moduleId: string, orderedIds: string[]) {
    return this.prisma.$transaction(
      orderedIds.map((id, position) =>
        this.prisma.lesson.update({ where: { id }, data: { position, moduleId } }),
      ),
    );
  }

  addResource(data: Prisma.ResourceUncheckedCreateInput) {
    return this.prisma.resource.create({ data });
  }

  updateResource(id: string, data: Prisma.ResourceUncheckedUpdateInput) {
    return this.prisma.resource.update({ where: { id }, data });
  }

  deleteResource(id: string) {
    return this.prisma.resource.delete({ where: { id } });
  }

  /** Reusable content library — resources flagged for cross-course reuse. */
  library(q: PageQuery) {
    return this.prisma.resource.findMany({
      where: {
        inLibrary: true,
        ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...paginate(q),
    });
  }

  // ────────────────────── Course player & progress ──────────────────────

  /** The learner-facing course view: structure plus this student's progress. */
  async player(courseId: string, studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              where: { state: ContentState.PUBLISHED },
              orderBy: { position: 'asc' },
              include: { resources: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });

    const progress = await this.prisma.progress.findMany({ where: { studentId, courseId } });
    const byLesson = new Map(progress.map((p) => [p.lessonId, p]));

    const modules = course.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({
        ...l,
        completed: byLesson.get(l.id)?.completed ?? false,
        lastPositionSec: byLesson.get(l.id)?.lastPositionSec ?? 0,
      })),
    }));

    const allLessons = modules.flatMap((m) => m.lessons);
    const completed = allLessons.filter((l) => l.completed).length;
    const lastTouched = progress
      .filter((p) => p.lessonId)
      .sort((a, b) => +b.updatedAt - +a.updatedAt)[0];

    return {
      course: { id: course.id, title: course.title, code: course.code, description: course.description },
      modules,
      completionPct: allLessons.length ? Math.round((completed / allLessons.length) * 100) : 0,
      lessonsTotal: allLessons.length,
      lessonsCompleted: completed,
      resumeLessonId: lastTouched?.lessonId ?? allLessons.find((l) => !l.completed)?.id ?? null,
    };
  }
}
