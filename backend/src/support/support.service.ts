import { Injectable } from '@nestjs/common';
import { EscalationLevel, Role, TicketSeverity, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Response-time targets by severity, in hours. */
const SLA_HOURS: Record<TicketSeverity, number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

/** Escalation matrix: site → academic admin → super admin (§5.15). */
const NEXT_LEVEL: Record<EscalationLevel, EscalationLevel | null> = {
  SITE: EscalationLevel.ACADEMIC_ADMIN,
  ACADEMIC_ADMIN: EscalationLevel.SUPER_ADMIN,
  SUPER_ADMIN: null,
};

const LEVEL_ROLE: Record<EscalationLevel, Role> = {
  SITE: Role.ACADEMIC_ADMIN,
  ACADEMIC_ADMIN: Role.ACADEMIC_ADMIN,
  SUPER_ADMIN: Role.SUPER_ADMIN,
};

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(
    requesterId: string,
    data: { subject: string; body: string; category?: string; severity?: TicketSeverity; siteId?: string },
  ) {
    const severity = data.severity ?? TicketSeverity.MEDIUM;
    const seq = (await this.prisma.supportTicket.count()) + 1;

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ...data,
        severity,
        requesterId,
        ticketNo: `TKT-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`,
        slaDueAt: new Date(Date.now() + SLA_HOURS[severity] * 3600 * 1000),
        events: { create: { actorId: requesterId, action: 'CREATED' } },
      },
    });

    await this.notifications.notifyRole(
      Role.ACADEMIC_ADMIN,
      {
        type: 'SUPPORT_TICKET',
        title: `New ${severity.toLowerCase()} ticket: ${ticket.ticketNo}`,
        body: ticket.subject,
        link: `/support/${ticket.id}`,
        alsoSms: severity === TicketSeverity.CRITICAL,
      },
      data.siteId,
    );

    return ticket;
  }

  list(filter: { status?: TicketStatus; severity?: TicketSeverity; siteId?: string; requesterId?: string }) {
    return this.prisma.supportTicket.findMany({
      where: filter,
      include: {
        requester: { select: { fullName: true, role: true } },
        assignee: { select: { fullName: true } },
        site: { select: { name: true, code: true } },
        _count: { select: { events: true } },
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.supportTicket.findUniqueOrThrow({
      where: { id },
      include: {
        requester: { select: { fullName: true, email: true, role: true } },
        assignee: { select: { fullName: true } },
        site: { select: { name: true, code: true } },
        events: { orderBy: { at: 'asc' } },
      },
    });
  }

  async assign(id: string, assigneeId: string, actorId: string) {
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        assigneeId,
        status: TicketStatus.ASSIGNED,
        events: { create: { actorId, action: 'ASSIGNED', note: assigneeId } },
      },
    });

    await this.notifications.notify(assigneeId, {
      type: 'SUPPORT_ASSIGNED',
      title: `Ticket assigned: ${ticket.ticketNo}`,
      body: ticket.subject,
      link: `/support/${ticket.id}`,
    });
    return ticket;
  }

  async escalate(id: string, actorId: string, note?: string) {
    const current = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    const next = NEXT_LEVEL[current.level];

    if (!next) {
      return this.prisma.supportTicket.update({
        where: { id },
        data: {
          events: {
            create: { actorId, action: 'ESCALATION_CAPPED', note: 'Already at the highest level.' },
          },
        },
      });
    }

    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        level: next,
        status: TicketStatus.ESCALATED,
        events: { create: { actorId, action: `ESCALATED_TO_${next}`, note } },
      },
    });

    await this.notifications.notifyRole(LEVEL_ROLE[next], {
      type: 'SUPPORT_ESCALATED',
      title: `Escalated ticket: ${ticket.ticketNo}`,
      body: ticket.subject,
      link: `/support/${ticket.id}`,
      alsoSms: ticket.severity === TicketSeverity.CRITICAL,
    });

    return ticket;
  }

  async comment(id: string, actorId: string, note: string) {
    await this.prisma.ticketEvent.create({ data: { ticketId: id, actorId, action: 'COMMENT', note } });
    return this.findOne(id);
  }

  async resolve(id: string, actorId: string, note?: string) {
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(),
        events: { create: { actorId, action: 'RESOLVED', note } },
      },
    });

    await this.notifications.notify(ticket.requesterId, {
      type: 'SUPPORT_RESOLVED',
      title: `Ticket resolved: ${ticket.ticketNo}`,
      body: note ?? 'Your support request has been resolved.',
      link: `/support/${ticket.id}`,
    });
    return ticket;
  }

  close(id: string, actorId: string) {
    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: TicketStatus.CLOSED, events: { create: { actorId, action: 'CLOSED' } } },
    });
  }

  /** SLA board: which open tickets have breached or are close to breaching. */
  async slaBoard() {
    const open = await this.prisma.supportTicket.findMany({
      where: { status: { in: [TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.ESCALATED] } },
      include: { site: { select: { name: true } } },
    });

    const now = Date.now();
    return open.map((t) => ({
      id: t.id,
      ticketNo: t.ticketNo,
      subject: t.subject,
      severity: t.severity,
      level: t.level,
      site: t.site?.name ?? '—',
      slaDueAt: t.slaDueAt,
      breached: t.slaDueAt ? t.slaDueAt.getTime() < now : false,
      hoursRemaining: t.slaDueAt ? Math.round((t.slaDueAt.getTime() - now) / 3600000) : null,
    }));
  }
}
