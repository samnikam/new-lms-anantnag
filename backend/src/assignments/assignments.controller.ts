import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from './assignments.service';

class CreateAssignmentDto {
  @IsString() courseId!: string;
  @IsOptional() @IsString() batchId?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsInt() @Min(1) maxMarks?: number;
  @Type(() => Date) @IsDate() dueAt!: Date;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsInt() @Min(0) latePenaltyPct?: number;
}

class UpdateAssignmentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsInt() @Min(1) maxMarks?: number;
  @IsOptional() @Type(() => Date) @IsDate() dueAt?: Date;
  @IsOptional() @IsBoolean() allowLate?: boolean;
  @IsOptional() @IsInt() @Min(0) latePenaltyPct?: number;
}

class SubmitDto {
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() fileKey?: string;
  @IsOptional() @IsString() fileName?: string;
}

class GradeDto {
  @IsNumber() @Min(0) marks!: number;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsBoolean() returnForRework?: boolean;
}

@ApiTags('assignments')
@Controller('assignments')
export class AssignmentsController {
  constructor(
    private assignments: AssignmentsService,
    private users: UsersService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('courseId') courseId?: string,
    @Query('batchId') batchId?: string,
  ) {
    // Students implicitly scope to their own enrolled, published assignments.
    return this.assignments.list({
      courseId,
      batchId,
      studentId: user.role === Role.STUDENT ? user.id : undefined,
    });
  }

  @Get('my-submissions')
  @Roles(Role.STUDENT)
  mySubmissions(@CurrentUser('id') studentId: string) {
    return this.assignments.mySubmissions(studentId);
  }

  @Get('students/:studentId/submissions')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER, Role.PARENT)
  async studentSubmissions(@Param('studentId') studentId: string, @CurrentUser() user: AuthUser) {
    await this.users.assertParentAccess(user, studentId);
    return this.assignments.mySubmissions(studentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignments.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  @Audit('assignment.create', 'Assignment')
  create(@Body() dto: CreateAssignmentDto, @CurrentUser('id') createdById: string) {
    return this.assignments.create({ ...dto, createdById } as any);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignments.update(id, dto as any);
  }

  @Post(':id/publish')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  @Audit('assignment.publish', 'Assignment')
  publish(@Param('id') id: string) {
    return this.assignments.publish(id);
  }

  @Post(':id/submit')
  @Roles(Role.STUDENT)
  submit(@Param('id') id: string, @Body() dto: SubmitDto, @CurrentUser('id') studentId: string) {
    return this.assignments.submit(id, studentId, dto);
  }

  @Post('submissions/:submissionId/grade')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER)
  @Audit('submission.grade', 'Submission')
  grade(
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeDto,
    @CurrentUser('id') gradedById: string,
  ) {
    return this.assignments.grade(submissionId, gradedById, dto);
  }
}
