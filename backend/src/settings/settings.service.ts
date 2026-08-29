import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Portal-wide configuration (§5.14). These are platform controls rather than
 * academic ones, so they sit with the Super Admin alone — an Academic Admin
 * runs courses and cohorts, not branding, retention or maintenance mode.
 */
export const SETTING_KEYS = {
  branding: 'portal.branding',
  academic: 'portal.academic',
  maintenance: 'portal.maintenance',
} as const;

const DEFAULTS: Record<string, unknown> = {
  [SETTING_KEYS.branding]: {
    portalName: 'Hybrid Learning LMS Portal',
    department: 'Public Works Department, J&K — R&B Division Pahalgam',
    supportEmail: 'support@lms.gov.in',
    primaryColor: '#1a3f75',
  },
  [SETTING_KEYS.academic]: {
    attendanceAlertThreshold: 75,
    defaultPassMark: 40,
    sessionTimeoutMinutes: 15,
    allowSelfEnrollment: false,
  },
  [SETTING_KEYS.maintenance]: {
    enabled: false,
    message: 'The portal is undergoing scheduled maintenance. Please try again shortly.',
  },
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /** Stored values merged over defaults, so a fresh install is fully configured. */
  async getAll() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } },
    });
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return Object.fromEntries(
      Object.entries(SETTING_KEYS).map(([name, key]) => [
        name,
        { ...(DEFAULTS[key] as object), ...((stored[key] as object) ?? {}) },
      ]),
    );
  }

  async update(name: keyof typeof SETTING_KEYS, value: Record<string, unknown>) {
    const key = SETTING_KEYS[name];
    const merged = { ...(DEFAULTS[key] as object), ...value };

    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: merged as any },
      update: { value: merged as any },
    });
    return { [name]: merged };
  }

  listTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
  }

  upsertTemplate(data: {
    key: string;
    channel: NotificationChannel;
    subject?: string;
    body: string;
    locale?: string;
    active?: boolean;
  }) {
    return this.prisma.notificationTemplate.upsert({
      where: { key: data.key },
      create: data,
      update: data,
    });
  }

  /**
   * Operational overview for the maintenance screen: table volumes and the
   * newest audit entry, so an administrator can sanity-check the deployment
   * without database access.
   */
  async systemOverview() {
    const [
      users,
      sites,
      classrooms,
      devices,
      courses,
      sessions,
      attendance,
      certificates,
      tickets,
      auditLogs,
      lastAudit,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.site.count(),
      this.prisma.classroom.count(),
      this.prisma.device.count(),
      this.prisma.course.count(),
      this.prisma.liveSession.count(),
      this.prisma.attendance.count(),
      this.prisma.certificate.count(),
      this.prisma.supportTicket.count(),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findFirst({ orderBy: { at: 'desc' }, select: { at: true } }),
    ]);

    return {
      records: {
        users,
        sites,
        classrooms,
        devices,
        courses,
        liveSessions: sessions,
        attendance,
        certificates,
        supportTickets: tickets,
        auditLogs,
      },
      lastAuditAt: lastAudit?.at ?? null,
      runtime: {
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
        environment: process.env.NODE_ENV ?? 'development',
      },
    };
  }

  /** Clears expired refresh tokens and stale password-reset entries. */
  async purgeExpiredSessions() {
    const now = new Date();
    const tokens = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
    });

    const resets = await this.prisma.setting.findMany({
      where: { key: { startsWith: 'pwreset:' } },
    });
    const expired = resets.filter((r) => ((r.value as any)?.expiresAt ?? 0) < Date.now());
    if (expired.length) {
      await this.prisma.setting.deleteMany({
        where: { key: { in: expired.map((r) => r.key) } },
      });
    }

    return { refreshTokensRemoved: tokens.count, resetTokensRemoved: expired.length };
  }
}
