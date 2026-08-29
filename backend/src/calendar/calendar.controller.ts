import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EnrollmentStatus, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateEventDto {
  @IsString() title!: string;
  @IsString() type!: string;
  @Type(() => Date) @IsDate() startAt!: Date;
  @Type(() => Date) @IsDate() endAt!: Date;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() academicYearId?: string;
}

/** Timetable and academic calendar, scoped per role (§5.6). */
@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('siteId') siteId?: string,
    @Query('studentId') studentId?: string,
  ) {
    const range = {
      gte: from ? new Date(from) : new Date(Date.now() - 7 * 864e5),
      lte: to ? new Date(to) : new Date(Date.now() + 60 * 864e5),
    };

    // Learners (and guardians viewing a child) see only their own courses.
    let courseFilter: string[] | undefined;
    const scopeTo = user.role === Role.STUDENT ? user.id : studentId;
    if (scopeTo && (user.role === Role.STUDENT || user.role === Role.PARENT)) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { studentId: scopeTo, status: EnrollmentStatus.ACTIVE },
        select: { courseId: true },
      });
      courseFilter = enrollments.map((e) => e.courseId);
    }

    return this.prisma.calendarEvent.findMany({
      where: {
        startAt: range,
        ...(siteId ? { siteId } : {}),
        ...(courseFilter ? { OR: [{ courseId: { in: courseFilter } }, { courseId: null }] } : {}),
      },
      orderBy: { startAt: 'asc' },
    });
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  create(@Body() dto: CreateEventDto, @CurrentUser('id') createdById: string) {
    return this.prisma.calendarEvent.create({ data: { ...dto, createdById } });
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  remove(@Param('id') id: string) {
    return this.prisma.calendarEvent.delete({ where: { id } });
  }
}
