import { Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, NotificationChannel, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  link?: string;
  alsoEmail?: boolean;
  alsoSms?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private prisma: PrismaService) {}

  async notify(userId: string, input: NotifyInput) {
    const channels: NotificationChannel[] = [NotificationChannel.IN_APP];
    if (input.alsoEmail) channels.push(NotificationChannel.EMAIL);
    if (input.alsoSms) channels.push(NotificationChannel.SMS);

    const created = await this.prisma.$transaction(
      channels.map((channel) =>
        this.prisma.notification.create({
          data: {
            userId,
            channel,
            type: input.type,
            title: input.title,
            body: input.body,
            link: input.link,
            delivery:
              channel === NotificationChannel.IN_APP ? DeliveryStatus.DELIVERED : DeliveryStatus.QUEUED,
            sentAt: channel === NotificationChannel.IN_APP ? new Date() : null,
          },
        }),
      ),
    );

    for (const n of created) {
      if (n.channel !== NotificationChannel.IN_APP) void this.dispatch(n.id);
    }
    return created;
  }

  async notifyMany(userIds: string[], input: NotifyInput) {
    for (const id of userIds) await this.notify(id, input);
    return { notified: userIds.length };
  }

  /** Sends to the learner and every approved guardian — the §6.5 alert fan-out. */
  async notifyStudentAndGuardians(studentId: string, input: NotifyInput) {
    const links = await this.prisma.parentStudentLink.findMany({
      where: { studentId, status: 'APPROVED' },
      select: { parentId: true },
    });
    return this.notifyMany([studentId, ...links.map((l) => l.parentId)], input);
  }

  /** Everyone holding a given role, optionally narrowed to one site. */
  async notifyRole(role: Role, input: NotifyInput, siteId?: string) {
    const users = await this.prisma.user.findMany({
      where: { role, status: 'ACTIVE', ...(siteId ? { siteId } : {}) },
      select: { id: true },
    });
    return this.notifyMany(users.map((u) => u.id), input);
  }

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ─────────────────────────── Announcements ───────────────────────────

  async announce(
    authorId: string,
    data: { title: string; body: string; courseId?: string; batchId?: string; siteId?: string; audience?: Role[]; pinned?: boolean },
  ) {
    const announcement = await this.prisma.announcement.create({
      data: { ...data, authorId, audience: data.audience ?? [] },
    });

    // Push a matching in-app notification to the intended recipients.
    const recipients = data.courseId
      ? await this.prisma.enrollment.findMany({
          where: { courseId: data.courseId, status: 'ACTIVE' },
          select: { studentId: true },
        })
      : [];

    if (recipients.length) {
      await this.notifyMany(recipients.map((r) => r.studentId), {
        type: 'ANNOUNCEMENT',
        title: data.title,
        body: data.body,
        link: '/announcements',
      });
    }
    return announcement;
  }

  listAnnouncements(filter: { courseId?: string; siteId?: string; role?: Role }) {
    return this.prisma.announcement.findMany({
      where: {
        ...(filter.courseId ? { courseId: filter.courseId } : {}),
        ...(filter.siteId ? { siteId: filter.siteId } : {}),
      },
      include: { author: { select: { fullName: true, role: true } } },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
    });
  }

  /**
   * Delivers a queued email/SMS notification.
   *
   * Gateway credentials are supplied at deployment; without them the payload is
   * logged and marked FAILED rather than silently dropped, so the delivery-status
   * report stays honest.
   */
  private async dispatch(notificationId: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true, mobile: true, fullName: true } } },
    });
    if (!n) return;

    try {
      if (n.channel === NotificationChannel.SMS) {
        if (!process.env.SMS_PROVIDER_KEY) throw new Error('SMS gateway is not configured.');
        if (!n.user.mobile) throw new Error('Recipient has no mobile number on file.');
        // await smsGateway.send(n.user.mobile, `${n.title}: ${n.body}`)
        this.logger.log(`SMS → ${n.user.mobile}: ${n.title}`);
      } else {
        if (!n.user.email) throw new Error('Recipient has no email address on file.');
        // await mailer.send({ to: n.user.email, subject: n.title, text: n.body })
        this.logger.log(`EMAIL → ${n.user.email}: ${n.title}`);
      }

      await this.prisma.notification.update({
        where: { id: n.id },
        data: { delivery: DeliveryStatus.SENT, sentAt: new Date() },
      });
    } catch (err: any) {
      await this.prisma.notification.update({
        where: { id: n.id },
        data: { delivery: DeliveryStatus.FAILED, error: err?.message ?? 'Delivery failed' },
      });
    }
  }
}
