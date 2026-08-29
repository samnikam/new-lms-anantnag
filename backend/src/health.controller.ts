import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

/**
 * Liveness and readiness for the container platform.
 *
 * `/api/health` answers as soon as the process is up and is what the platform
 * health check targets — it must not depend on the database, or a brief
 * database blip would take the whole service out of rotation.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  live() {
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      return { status: 'degraded', database: 'unreachable' };
    }
  }
}
