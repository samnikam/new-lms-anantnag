import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Audit records are readable by the Super Admin only (§10). */
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  list(
    @Query('entity') entity?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('take') take = '100',
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(actorId ? { actorId } : {}),
        ...(action ? { action: { contains: action } } : {}),
      },
      include: { actor: { select: { fullName: true, role: true } } },
      orderBy: { at: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }

  @Get('login-history')
  @Roles(Role.SUPER_ADMIN)
  loginHistory() {
    return this.prisma.refreshToken.findMany({
      select: {
        id: true,
        createdAt: true,
        ip: true,
        userAgent: true,
        revokedAt: true,
        user: { select: { fullName: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
