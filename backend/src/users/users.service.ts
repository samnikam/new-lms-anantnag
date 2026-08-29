import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LinkStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PageQuery, pageResult, paginate } from '../common/pagination';
import { AuthUser } from '../common/decorators/current-user.decorator';

const SAFE_SELECT = {
  id: true,
  fullName: true,
  email: true,
  mobile: true,
  username: true,
  role: true,
  status: true,
  locale: true,
  siteId: true,
  site: { select: { id: true, name: true, code: true } },
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list(q: PageQuery & { role?: Role; status?: UserStatus; siteId?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.siteId ? { siteId: q.siteId } : {}),
      ...(q.search
        ? {
            OR: [
              { fullName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { mobile: { contains: q.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        ...paginate(q),
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items, total, q);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async create(data: {
    fullName: string;
    email?: string;
    mobile?: string;
    username?: string;
    password: string;
    role: Role;
    siteId?: string;
    locale?: string;
  }) {
    if (!data.email && !data.mobile && !data.username) {
      throw new BadRequestException('Provide at least an email, mobile number or username.');
    }
    return this.prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email?.toLowerCase() || null,
        mobile: data.mobile || null,
        username: data.username || null,
        role: data.role,
        siteId: data.siteId || null,
        locale: data.locale ?? 'en',
        passwordHash: await AuthService.hashPassword(data.password),
      },
      select: SAFE_SELECT,
    });
  }

  update(id: string, data: Partial<{ fullName: string; email: string; mobile: string; siteId: string; locale: string; status: UserStatus }>) {
    return this.prisma.user.update({
      where: { id },
      data: { ...data, email: data.email?.toLowerCase() },
      select: SAFE_SELECT,
    });
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.update({ where: { id }, data: { status }, select: SAFE_SELECT });
    if (status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return user;
  }

  async resetPasswordByAdmin(id: string, newPassword: string) {
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await AuthService.hashPassword(newPassword),
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /** Bulk import from a parsed CSV payload. Reports per-row outcomes. */
  async bulkImport(
    rows: Array<{ fullName: string; email?: string; mobile?: string; role: Role; siteCode?: string; password?: string }>,
  ) {
    const sites = await this.prisma.site.findMany({ select: { id: true, code: true } });
    const siteByCode = new Map(sites.map((s) => [s.code, s.id]));

    const created: string[] = [];
    const failed: Array<{ row: number; reason: string }> = [];

    for (const [index, row] of rows.entries()) {
      try {
        if (!row.fullName?.trim()) throw new Error('fullName is required');
        const user = await this.create({
          fullName: row.fullName.trim(),
          email: row.email?.trim(),
          mobile: row.mobile?.trim(),
          role: row.role,
          siteId: row.siteCode ? siteByCode.get(row.siteCode) : undefined,
          password: row.password?.trim() || defaultPassword(row),
        });
        created.push(user.id);
      } catch (err: any) {
        failed.push({ row: index + 1, reason: err?.message ?? 'Import failed' });
      }
    }
    return { createdCount: created.length, failedCount: failed.length, failed };
  }

  // ───────────────── Parent ↔ student linking (§6.1) ─────────────────

  async linkParent(parentId: string, studentId: string, relation = 'guardian') {
    const [parent, student] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: parentId } }),
      this.prisma.user.findUnique({ where: { id: studentId } }),
    ]);
    if (parent?.role !== Role.PARENT) throw new BadRequestException('That account is not a parent account.');
    if (student?.role !== Role.STUDENT) throw new BadRequestException('That account is not a student account.');

    return this.prisma.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId, studentId } },
      create: { parentId, studentId, relation, status: LinkStatus.PENDING },
      update: { status: LinkStatus.PENDING, relation },
    });
  }

  async setLinkStatus(linkId: string, status: LinkStatus, approverId: string) {
    return this.prisma.parentStudentLink.update({
      where: { id: linkId },
      data: {
        status,
        approvedBy: approverId,
        approvedAt: status === LinkStatus.APPROVED ? new Date() : null,
      },
    });
  }

  listLinks(filter: { parentId?: string; studentId?: string; status?: LinkStatus }) {
    return this.prisma.parentStudentLink.findMany({
      where: filter,
      include: {
        parent: { select: { id: true, fullName: true, email: true, mobile: true } },
        student: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Parent data isolation (§11): resolves the students a parent may read and
   * throws if they ask for anyone else. Every parent-facing query goes through
   * this rather than trusting a studentId from the request.
   */
  async assertParentAccess(user: AuthUser, studentId: string) {
    if (user.role !== Role.PARENT) return;
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId: user.id, studentId } },
    });
    if (!link || link.status !== LinkStatus.APPROVED) {
      throw new ForbiddenException('You are not authorised to view this student.');
    }
  }

  async childrenOf(parentId: string) {
    const links = await this.prisma.parentStudentLink.findMany({
      where: { parentId, status: LinkStatus.APPROVED },
      include: {
        student: {
          select: { id: true, fullName: true, email: true, site: { select: { name: true } } },
        },
      },
    });
    return links.map((l) => ({ ...l.student, relation: l.relation }));
  }
}

function defaultPassword(row: { mobile?: string; email?: string }) {
  // Deterministic first-login password; users are forced to change it in the UI.
  const seed = row.mobile?.slice(-6) ?? row.email?.split('@')[0] ?? 'welcome';
  return `Lms@${seed}`.padEnd(10, '1');
}
