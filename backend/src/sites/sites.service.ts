import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceStatus, DeviceType, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

const CLASSROOM_PUBLIC = {
  id: true,
  name: true,
  code: true,
  siteId: true,
  isStudio: true,
  capacity: true,
} as const;

/** A panel that has not reported in this long is treated as offline. */
export const HEARTBEAT_STALE_MS = 5 * 60_000;

@Injectable()
export class SitesService {
  constructor(private prisma: PrismaService) {}

  // ───────────────────────────── Sites ─────────────────────────────

  listSites() {
    return this.prisma.site.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: { select: { classrooms: true, users: true } },
      },
    });
  }

  async getSite(id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        classrooms: {
          select: { ...CLASSROOM_PUBLIC, kioskUsername: true, devices: true },
        },
      },
    });
    if (!site) throw new NotFoundException('Site not found.');
    return site;
  }

  createSite(data: Prisma.SiteCreateInput) {
    return this.prisma.site.create({ data });
  }

  updateSite(id: string, data: Prisma.SiteUpdateInput) {
    return this.prisma.site.update({ where: { id }, data });
  }

  // ─────────────────────────── Classrooms ───────────────────────────

  listClassrooms(siteId?: string) {
    return this.prisma.classroom.findMany({
      where: siteId ? { siteId } : {},
      // kioskPasswordHash is deliberately absent: administrators set a panel
      // password, they never read one back.
      select: {
        ...CLASSROOM_PUBLIC,
        kioskUsername: true,
        active: true,
        site: { select: { id: true, name: true, code: true } },
        devices: { select: { id: true, type: true, serialNo: true, status: true, lastSeenAt: true } },
      },
      orderBy: [{ site: { code: 'asc' } }, { code: 'asc' }],
    });
  }

  async createClassroom(data: {
    siteId: string;
    name: string;
    code: string;
    capacity?: number;
    isStudio?: boolean;
    kioskUsername?: string;
    kioskPassword?: string;
  }) {
    const { kioskPassword, ...rest } = data;
    return this.prisma.classroom.create({
      data: {
        ...rest,
        kioskPasswordHash: kioskPassword
          ? await argon2.hash(kioskPassword, { type: argon2.argon2id })
          : null,
      },
    });
  }

  async updateClassroom(
    id: string,
    data: Partial<{
      name: string;
      capacity: number;
      isStudio: boolean;
      active: boolean;
      kioskUsername: string;
      kioskPassword: string;
    }>,
  ) {
    const { kioskPassword, ...rest } = data;
    return this.prisma.classroom.update({
      where: { id },
      data: {
        ...rest,
        ...(kioskPassword
          ? { kioskPasswordHash: await argon2.hash(kioskPassword, { type: argon2.argon2id }) }
          : {}),
      },
    });
  }

  // ───────────────────────────── Devices ─────────────────────────────

  listDevices(filter: { classroomId?: string; siteId?: string; status?: DeviceStatus; type?: DeviceType }) {
    return this.prisma.device.findMany({
      where: {
        ...(filter.classroomId ? { classroomId: filter.classroomId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.siteId ? { classroom: { siteId: filter.siteId } } : {}),
      },
      include: {
        classroom: { select: { id: true, name: true, code: true, site: { select: { name: true, code: true } } } },
      },
      orderBy: { serialNo: 'asc' },
    });
  }

  registerDevice(data: {
    classroomId: string;
    type: DeviceType;
    serialNo: string;
    model?: string;
    ipAddress?: string;
    notes?: string;
  }) {
    return this.prisma.device.create({ data });
  }

  updateDevice(id: string, data: Prisma.DeviceUpdateInput) {
    return this.prisma.device.update({ where: { id }, data });
  }

  /**
   * Called by the classroom OPS PC agent. Marks the device online and records
   * a heartbeat sample used by the department oversight uptime report.
   */
  async heartbeat(
    serialNo: string,
    metrics: { cpu?: number; memory?: number; bandwidth?: number; appVersion?: string; ipAddress?: string },
  ) {
    const device = await this.prisma.device.findUnique({ where: { serialNo } });
    if (!device) throw new NotFoundException('Device is not registered.');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: device.id },
        data: {
          status: DeviceStatus.ONLINE,
          lastSeenAt: now,
          appVersion: metrics.appVersion ?? device.appVersion,
          ipAddress: metrics.ipAddress ?? device.ipAddress,
        },
      }),
      this.prisma.deviceHeartbeat.create({
        data: {
          deviceId: device.id,
          cpu: metrics.cpu,
          memory: metrics.memory,
          bandwidth: metrics.bandwidth,
          online: true,
        },
      }),
    ]);

    return { ok: true, acknowledgedAt: now };
  }

  /** Sweeps devices whose last heartbeat has gone stale. Runs on a schedule. */
  async markStaleDevicesOffline() {
    const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);
    const { count } = await this.prisma.device.updateMany({
      where: {
        status: DeviceStatus.ONLINE,
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null }],
      },
      data: { status: DeviceStatus.OFFLINE },
    });
    return { markedOffline: count };
  }

  /** Live device-status board — the department oversight dashboard's core view. */
  async statusBoard() {
    const sites = await this.prisma.site.findMany({
      where: { active: true },
      include: {
        classrooms: {
          include: { devices: { select: { id: true, type: true, status: true, lastSeenAt: true, serialNo: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });

    return sites.map((site) => {
      const devices = site.classrooms.flatMap((c) => c.devices);
      const online = devices.filter((d) => d.status === DeviceStatus.ONLINE).length;
      return {
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        district: site.district,
        classrooms: site.classrooms.length,
        devicesTotal: devices.length,
        devicesOnline: online,
        uptimePct: devices.length ? Math.round((online / devices.length) * 100) : 0,
        lastSeenAt: devices.reduce<Date | null>(
          (latest, d) => (d.lastSeenAt && (!latest || d.lastSeenAt > latest) ? d.lastSeenAt : latest),
          null,
        ),
      };
    });
  }
}
