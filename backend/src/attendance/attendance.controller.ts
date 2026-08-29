import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AttendanceKind, AttendanceStatus, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { AttendanceService } from './attendance.service';

class MarkEntry {
  @IsString() studentId!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @IsOptional() @IsString() remarks?: string;
}

class MarkSessionDto {
  @IsArray() @ArrayNotEmpty() @Type(() => MarkEntry) entries!: MarkEntry[];
}

class CorrectDto {
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @IsString() @MinLength(5) reason!: string;
}

class ListAttendanceQuery {
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsEnum(AttendanceKind) kind?: AttendanceKind;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private attendance: AttendanceService,
    private users: UsersService,
  ) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  list(@Query() q: ListAttendanceQuery) {
    return this.attendance.list(q);
  }

  @Get('sessions/:sessionId/roster')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  roster(@Param('sessionId') sessionId: string) {
    return this.attendance.sessionRoster(sessionId);
  }

  @Get('my-summary')
  @Roles(Role.STUDENT)
  mySummary(@CurrentUser('id') studentId: string, @Query('courseId') courseId?: string) {
    return this.attendance.studentSummary(studentId, courseId);
  }

  /** Guardian view — access is checked against the approved link, not the URL. */
  @Get('students/:studentId/summary')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER, Role.PARENT)
  async studentSummary(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthUser,
    @Query('courseId') courseId?: string,
  ) {
    await this.users.assertParentAccess(user, studentId);
    return this.attendance.studentSummary(studentId, courseId);
  }

  @Get('sites/summary')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.DEPT_OVERSIGHT)
  siteSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.attendance.siteSummary(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post('sessions/:sessionId/mark')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  @Audit('attendance.mark', 'Attendance')
  mark(
    @Param('sessionId') sessionId: string,
    @Body() dto: MarkSessionDto,
    @CurrentUser('id') markedById: string,
  ) {
    return this.attendance.markSession(sessionId, dto.entries, markedById);
  }

  @Patch(':id/correct')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('attendance.correct', 'Attendance')
  correct(@Param('id') id: string, @Body() dto: CorrectDto, @CurrentUser('id') actorId: string) {
    return this.attendance.correct(id, dto.status, dto.reason, actorId);
  }
}
