import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { ProgressService } from './progress.service';

class TrackDto {
  @IsString() courseId!: string;
  @IsString() lessonId!: string;
  @IsOptional() @IsBoolean() completed?: boolean;
  @IsOptional() @IsInt() @Min(0) secondsSpent?: number;
  @IsOptional() @IsInt() @Min(0) lastPositionSec?: number;
}

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(
    private progress: ProgressService,
    private users: UsersService,
  ) {}

  @Post('track')
  @Roles(Role.STUDENT)
  track(@CurrentUser('id') studentId: string, @Body() dto: TrackDto) {
    return this.progress.track(studentId, dto);
  }

  @Get('my-courses')
  @Roles(Role.STUDENT)
  myCourses(@CurrentUser('id') studentId: string) {
    return this.progress.myCourses(studentId);
  }

  @Get('my-courses/:courseId')
  @Roles(Role.STUDENT)
  mySummary(@CurrentUser('id') studentId: string, @Param('courseId') courseId: string) {
    return this.progress.courseSummary(studentId, courseId);
  }

  @Get('students/:studentId')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER, Role.PARENT)
  async forStudent(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthUser,
    @Query('courseId') courseId?: string,
  ) {
    await this.users.assertParentAccess(user, studentId);
    return courseId
      ? this.progress.courseSummary(studentId, courseId)
      : this.progress.myCourses(studentId);
  }

  @Get('courses/:courseId/cohort')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  cohort(@Param('courseId') courseId: string) {
    return this.progress.cohortProgress(courseId);
  }
}
