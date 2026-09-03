import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';

export const EVENT_TYPES = ['CLASS', 'EXAM', 'DEADLINE', 'HOLIDAY', 'EVENT'] as const;

class CreateEventDto {
  @IsString() title!: string;
  @IsIn(EVENT_TYPES as unknown as string[]) type!: string;
  @Type(() => Date) @IsDate() startAt!: Date;
  @Type(() => Date) @IsDate() endAt!: Date;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() academicYearId?: string;
}

class UpdateEventDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsIn(EVENT_TYPES as unknown as string[]) type?: string;
  @IsOptional() @Type(() => Date) @IsDate() startAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endAt?: Date;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() siteId?: string;
}

/**
 * Timetable and academic calendar.
 *
 * Authoring belongs to the Super Admin and the Academic Admin — the academic
 * office owns the official timetable. Teachers, learners and guardians read
 * their own slice of it, which the service narrows server-side.
 */
@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private calendar: CalendarService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('siteId') siteId?: string,
    @Query('studentId') studentId?: string,
    @Query('courseId') courseId?: string,
    @Query('batchId') batchId?: string,
    @Query('type') type?: string,
  ) {
    return this.calendar.list(user, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      siteId,
      studentId,
      courseId,
      batchId,
      type,
    });
  }

  /** Tells the UI whether to offer authoring controls at all. */
  @Get('permissions')
  permissions(@CurrentUser() user: AuthUser) {
    const canManage = CalendarService.canManage(user.role);
    return {
      canCreate: canManage,
      canEdit: canManage,
      canDelete: canManage,
      scopedToSiteId: user.role === Role.ACADEMIC_ADMIN ? user.siteId ?? null : null,
    };
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('calendar.create', 'CalendarEvent')
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthUser) {
    return this.calendar.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('calendar.update', 'CalendarEvent')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto, @CurrentUser() user: AuthUser) {
    return this.calendar.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('calendar.delete', 'CalendarEvent')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.calendar.remove(user, id);
  }
}
