import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationChannel, Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { SettingsService, SETTING_KEYS } from './settings.service';

class TemplateDto {
  @IsString() key!: string;
  @IsEnum(NotificationChannel) channel!: NotificationChannel;
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

/**
 * Platform administration. Restricted to the Super Admin throughout: these are
 * system controls, not academic operations (§2).
 */
@ApiTags('settings')
@Controller('settings')
@Roles(Role.SUPER_ADMIN)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Get('system')
  system() {
    return this.settings.systemOverview();
  }

  @Get('templates')
  templates() {
    return this.settings.listTemplates();
  }

  @Put(':name')
  @Audit('settings.update', 'Setting')
  update(@Param('name') name: keyof typeof SETTING_KEYS, @Body() body: Record<string, unknown>) {
    return this.settings.update(name, body);
  }

  @Post('templates')
  @Audit('notification_template.upsert', 'NotificationTemplate')
  upsertTemplate(@Body() dto: TemplateDto) {
    return this.settings.upsertTemplate(dto);
  }

  @Post('purge-sessions')
  @Audit('settings.purge_sessions', 'RefreshToken')
  purge() {
    return this.settings.purgeExpiredSessions();
  }
}
