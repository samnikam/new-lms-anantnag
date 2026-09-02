import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fields a user may change about themselves. Role, site and status are
 * deliberately absent — nobody edits their own authority or scope (§23).
 */
class UpdateProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() locale?: string;
}

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        role: true,
        status: true,
        locale: true,
        lastLoginAt: true,
        createdAt: true,
        site: { select: { id: true, name: true, code: true, district: true } },
      },
    });
    return profile;
  }

  /** Recent sign-ins, so a user can spot a session they do not recognise. */
  @Get('sessions')
  sessions(@CurrentUser('id') userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId },
      select: { id: true, createdAt: true, ip: true, userAgent: true, revokedAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  @Patch()
  @Audit('profile.update', 'User')
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { ...dto, email: dto.email?.toLowerCase() },
      select: { id: true, fullName: true, email: true, mobile: true, locale: true },
    });
  }
}
