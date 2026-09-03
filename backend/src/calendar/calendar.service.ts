import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertSiteAllowed, scopeSiteId } from '../common/site-scope';

export interface CalendarFilter {
  from?: Date;
  to?: Date;
  siteId?: string;
  studentId?: string;
  courseId?: string;
  classId?: string;
  batchId?: string;
  type?: string;
}

/**
 * Timetable access, by role:
 *
 *   Super Admin     every timetable, full edit
 *   Academic Admin  the official timetable for their assigned site, full edit
 *   Teacher         their own teaching timetable, read-only
 *   Student         their batch and enrolled-course timetable, read-only
 *   Parent          their linked child's timetable, read-only
 *
 * The narrowing happens here rather than in the UI, so a hand-rolled request
 * cannot read another site's or another child's schedule.
 */
@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  /** Roles allowed to author the timetable at all. */
  static canManage(role: Role): boolean {
    return role === Role.SUPER_ADMIN || role === Role.ACADEMIC_ADMIN;
  }

  async list(user: AuthUser, filter: CalendarFilter) {
    const where: Prisma.CalendarEventWhereInput = {
      startAt: {
        gte: filter.from ?? new Date(Date.now() - 7 * 864e5),
        lte: filter.to ?? new Date(Date.now() + 90 * 864e5),
      },
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.courseId ? { courseId: filter.courseId } : {}),
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.batchId ? { batchId: filter.batchId } : {}),
    };

    const scope = await this.scopeFor(user, filter);
    const events = await this.prisma.calendarEvent.findMany({
      where: { ...where, ...scope },
      orderBy: { startAt: 'asc' },
      take: 500,
    });

    // Names, so the timetable reads as a schedule rather than a list of ids.
    return this.decorate(events);
  }

  /** Builds the role-specific slice of the timetable. */
  private async scopeFor(user: AuthUser, filter: CalendarFilter): Promise<Prisma.CalendarEventWhereInput> {
    switch (user.role) {
      case Role.SUPER_ADMIN:
        return filter.siteId ? { siteId: filter.siteId } : {};

      case Role.ACADEMIC_ADMIN: {
        // Confined to the assigned site; division-wide admins see everything.
        const site = scopeSiteId(user);
        if (filter.siteId) assertSiteAllowed(user, filter.siteId);
        const chosen = filter.siteId ?? site;
        // Division-wide entries carry no site and belong on every calendar.
        return chosen ? { OR: [{ siteId: chosen }, { siteId: null }] } : {};
      }

      case Role.TEACHER: {
        const [taught, hosted] = await Promise.all([
          this.prisma.courseTeacher.findMany({
            where: { teacherId: user.id },
            select: { courseId: true },
          }),
          this.prisma.liveSession.findMany({
            where: { hostId: user.id },
            select: { id: true },
          }),
        ]);
        return {
          OR: [
            { courseId: { in: taught.map((t) => t.courseId) } },
            { sessionId: { in: hosted.map((h) => h.id) } },
            { createdById: user.id },
          ],
        };
      }

      case Role.STUDENT:
        return this.learnerScope(user.id);

      case Role.PARENT: {
        // Only a linked, approved child — and by default all of them.
        const links = await this.prisma.parentStudentLink.findMany({
          where: { parentId: user.id, status: 'APPROVED' },
          select: { studentId: true },
        });
        const allowed = links.map((l) => l.studentId);

        if (filter.studentId && !allowed.includes(filter.studentId)) {
          throw new ForbiddenException('You are not authorised to view that learner.');
        }
        const children = filter.studentId ? [filter.studentId] : allowed;
        if (children.length === 0) return { id: '__none__' };

        const scopes = await Promise.all(children.map((id) => this.learnerScope(id)));
        return { OR: scopes };
      }

      default:
        // Oversight and content roles get the shared, non-personal entries only.
        return { courseId: null };
    }
  }

  /** A learner's timetable: their batch, their courses, and shared entries. */
  private async learnerScope(studentId: string): Promise<Prisma.CalendarEventWhereInput> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: EnrollmentStatus.ACTIVE },
      select: { courseId: true, batchId: true, batch: { select: { classId: true } } },
    });

    const courseIds = enrollments.map((e) => e.courseId);
    const batchIds = enrollments.map((e) => e.batchId).filter((b): b is string => !!b);
    // An entry for the whole class reaches every section within it.
    const classIds = [
      ...new Set(enrollments.map((e) => e.batch?.classId).filter((c): c is string => !!c)),
    ];

    return {
      OR: [
        { courseId: { in: courseIds } },
        ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
        ...(classIds.length ? [{ classId: { in: classIds } }] : []),
        // Holidays and division-wide notices belong to everyone.
        { AND: [{ courseId: null }, { batchId: null }, { classId: null }] },
      ],
    };
  }

  private async decorate(events: any[]) {
    const courseIds = [...new Set(events.map((e) => e.courseId).filter(Boolean))];
    const batchIds = [...new Set(events.map((e) => e.batchId).filter(Boolean))];
    const classIds = [...new Set(events.map((e) => e.classId).filter(Boolean))];
    const siteIds = [...new Set(events.map((e) => e.siteId).filter(Boolean))];

    const [courses, batches, classes, sites] = await Promise.all([
      courseIds.length
        ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true, code: true } })
        : [],
      batchIds.length
        ? this.prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true } })
        : [],
      classIds.length
        ? this.prisma.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
        : [],
      siteIds.length
        ? this.prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const byId = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
    const c = byId(courses), b = byId(batches), k = byId(classes), s = byId(sites);

    return events.map((e) => ({
      ...e,
      course: e.courseId ? c[e.courseId] ?? null : null,
      batch: e.batchId ? b[e.batchId] ?? null : null,
      schoolClass: e.classId ? k[e.classId] ?? null : null,
      site: e.siteId ? s[e.siteId] ?? null : null,
    }));
  }

  async create(user: AuthUser, data: any) {
    if (data.endAt <= data.startAt) {
      throw new ForbiddenException('The event must end after it starts.');
    }

    // A scoped admin authors the timetable for their own site, and only there.
    const scope = scopeSiteId(user);
    if (scope) {
      if (data.siteId && data.siteId !== scope) {
        throw new ForbiddenException('You can only schedule at your assigned site.');
      }
      data = { ...data, siteId: scope };
    }

    const clash = await this.findConflict(data);
    const event = await this.prisma.calendarEvent.create({
      data: { ...data, createdById: user.id },
    });
    return { ...event, conflict: clash };
  }

  async update(user: AuthUser, id: string, data: any) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Timetable entry not found.');
    assertSiteAllowed(user, existing.siteId);
    if (data.siteId) assertSiteAllowed(user, data.siteId);

    return this.prisma.calendarEvent.update({ where: { id }, data });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Timetable entry not found.');
    assertSiteAllowed(user, existing.siteId);

    // A session-backed entry is the session's mirror; removing it alone would
    // leave the calendar disagreeing with the schedule.
    if (existing.sessionId) {
      throw new ForbiddenException(
        'This entry belongs to a live session. Cancel the session instead.',
      );
    }

    await this.prisma.calendarEvent.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Reports an overlapping entry for the same batch or course, so the office
   * sees a double-booking rather than discovering it on the day.
   */
  private async findConflict(data: any) {
    if (!data.batchId && !data.courseId && !data.classId) return null;

    const clash = await this.prisma.calendarEvent.findFirst({
      where: {
        startAt: { lt: data.endAt },
        endAt: { gt: data.startAt },
        OR: [
          ...(data.batchId ? [{ batchId: data.batchId }] : []),
          ...(data.classId ? [{ classId: data.classId }] : []),
          ...(data.courseId ? [{ courseId: data.courseId }] : []),
        ],
      },
      select: { id: true, title: true, startAt: true },
    });

    return clash
      ? { message: `Overlaps "${clash.title}" already scheduled at that time.`, event: clash }
      : null;
  }
}
