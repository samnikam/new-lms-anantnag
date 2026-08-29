import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  static hashPassword(plain: string) {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  /** Personal-account login (admins, teachers, students, parents, oversight). */
  async login(identifier: string, password: string, ctx: { ip?: string; ua?: string }) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }, { mobile: identifier }],
      },
    });

    // Uniform failure message — never reveal whether the account exists.
    const invalid = new UnauthorizedException('Invalid credentials.');
    if (!user) throw invalid;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked after repeated failed attempts. Try again later.',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active. Contact your administrator.');
    }

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil:
            failed >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      });
      throw invalid;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(
      { sub: user.id, role: user.role, name: user.fullName, siteId: user.siteId },
      user.id,
      ctx,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        siteId: user.siteId,
        locale: user.locale,
      },
    };
  }

  /**
   * Kiosk-mode login for a shared classroom panel / OPS PC. [NEW per §3B.1]
   * Grants a device-scoped token, not a personal identity: it can open the
   * day's scheduled session and submit room-level attendance, nothing more.
   */
  async kioskLogin(kioskUsername: string, kioskPassword: string, ctx: { ip?: string; ua?: string }) {
    const room = await this.prisma.classroom.findUnique({
      where: { kioskUsername },
      include: { site: true },
    });
    if (!room?.kioskPasswordHash || !room.active) {
      throw new UnauthorizedException('Invalid classroom credentials.');
    }
    const ok = await argon2.verify(room.kioskPasswordHash, kioskPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Invalid classroom credentials.');

    const accessToken = await this.jwt.signAsync(
      {
        sub: `kiosk:${room.id}`,
        role: 'KIOSK',
        kioskClassroomId: room.id,
        siteId: room.siteId,
        name: `${room.site.name} — ${room.name}`,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '12h', // one school day
      },
    );

    return {
      accessToken,
      classroom: {
        id: room.id,
        name: room.name,
        code: room.code,
        siteId: room.siteId,
        siteName: room.site.name,
        isStudio: room.isStudio,
      },
    };
  }

  async refresh(refreshToken: string, ctx: { ip?: string; ua?: string }) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token.');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Reuse of a revoked token: revoke the whole family defensively.
      if (stored?.revokedAt) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    return this.issueTokens(
      { sub: user.id, role: user.role, name: user.fullName, siteId: user.siteId },
      user.id,
      ctx,
    );
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new BadRequestException('Current password is incorrect.');
    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(newPassword) },
    });
    // Force re-authentication everywhere.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Password reset always reports success so the endpoint cannot be used to
   * enumerate accounts. In production the token is emailed / SMSed.
   */
  async requestPasswordReset(identifier: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { mobile: identifier }] },
    });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.prisma.setting.upsert({
        where: { key: `pwreset:${hashToken(token)}` },
        create: {
          key: `pwreset:${hashToken(token)}`,
          value: { userId: user.id, expiresAt: Date.now() + 30 * 60_000 },
        },
        update: {
          value: { userId: user.id, expiresAt: Date.now() + 30 * 60_000 },
        },
      });
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          channel: user.email ? 'EMAIL' : 'SMS',
          type: 'PASSWORD_RESET',
          title: 'Password reset requested',
          body: `Use this code to reset your password: ${token.slice(0, 8).toUpperCase()}`,
          link: `/reset-password?token=${token}`,
        },
      });
    }
    return { ok: true, message: 'If the account exists, reset instructions have been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const key = `pwreset:${hashToken(token)}`;
    const record = await this.prisma.setting.findUnique({ where: { key } });
    const value = record?.value as any;
    if (!value || value.expiresAt < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    await this.prisma.user.update({
      where: { id: value.userId },
      data: {
        passwordHash: await AuthService.hashPassword(newPassword),
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await this.prisma.setting.delete({ where: { key } }).catch(() => undefined);
    await this.prisma.refreshToken.updateMany({
      where: { userId: value.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        role: true,
        status: true,
        locale: true,
        siteId: true,
        site: { select: { id: true, name: true, code: true } },
        lastLoginAt: true,
      },
    });

    // Parents carry their authorised child list on the session payload.
    if (user.role === Role.PARENT) {
      const links = await this.prisma.parentStudentLink.findMany({
        where: { parentId: userId, status: 'APPROVED' },
        include: { student: { select: { id: true, fullName: true } } },
      });
      return { ...user, children: links.map((l) => l.student) };
    }
    return user;
  }

  private async issueTokens(
    payload: Record<string, unknown>,
    userId: string,
    ctx: { ip?: string; ua?: string },
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
    });
    // The jti keeps every issued refresh token distinct. Without it two tokens
    // minted for the same user within the same second are byte-identical, and
    // rotation collides on the tokenHash unique index.
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti: randomBytes(16).toString('hex') },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_TTL ?? '7d',
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        ip: ctx.ip,
        userAgent: ctx.ua,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
