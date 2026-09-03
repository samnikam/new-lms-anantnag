import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { resolveSiteFilter } from '../common/site-scope';
import { Audit } from '../common/decorators/audit.decorator';
import { AcademicService } from './academic.service';
import {
  AddClassSubjectDto,
  CreateBatchDto,
  CreateClassDto,
  CreateYearDto,
  EnrollBatchDto,
  EnrollDto,
  EnrollInClassDto,
  EnrollManyDto,
  EnrollmentStatusDto,
  TransferEnrollmentDto,
  UpdateBatchDto,
  UpdateClassDto,
  WithdrawEnrollmentDto,
} from './dto';

const ADMINS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN] as const;
const READERS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER] as const;

@ApiTags('academic')
@Controller()
export class AcademicController {
  constructor(private academic: AcademicService) {}

  @Get('academic-years')
  @Roles(...READERS)
  listYears() {
    return this.academic.listYears();
  }

  @Post('academic-years')
  @Roles(...ADMINS)
  @Audit('academic_year.create', 'AcademicYear')
  createYear(@Body() dto: CreateYearDto) {
    return this.academic.createYear(dto);
  }

  @Patch('academic-years/:id/current')
  @Roles(...ADMINS)
  @Audit('academic_year.set_current', 'AcademicYear')
  setCurrent(@Param('id') id: string) {
    return this.academic.setCurrentYear(id);
  }

  @Get('classes')
  @Roles(...READERS)
  listClasses(
    @CurrentUser() actor: AuthUser,
    @Query('academicYearId') academicYearId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.academic.listClasses({
      academicYearId,
      siteId: resolveSiteFilter(actor, siteId),
    });
  }

  @Post('classes')
  @Roles(...ADMINS)
  @Audit('class.create', 'SchoolClass')
  createClass(@Body() dto: CreateClassDto, @CurrentUser() actor: AuthUser) {
    return this.academic.createClass(dto, actor);
  }

  @Patch('classes/:id')
  @Roles(...ADMINS)
  @Audit('class.update', 'SchoolClass')
  updateClass(@Param('id') id: string, @Body() dto: UpdateClassDto, @CurrentUser() actor: AuthUser) {
    return this.academic.updateClass(id, dto, actor);
  }

  @Delete('classes/:id')
  @Roles(...ADMINS)
  @Audit('class.delete', 'SchoolClass')
  deleteClass(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.academic.deleteClass(id, actor);
  }

  @Get('classes/:id/subjects')
  @Roles(...READERS)
  listClassSubjects(@Param('id') id: string) {
    return this.academic.listClassSubjects(id);
  }

  @Post('classes/:id/subjects')
  @Roles(...ADMINS)
  @Audit('class.add_subject', 'ClassSubject')
  addSubject(
    @Param('id') id: string,
    @Body() dto: AddClassSubjectDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.academic.addSubjectToClass(id, dto, actor);
  }

  @Delete('classes/:id/subjects/:courseId')
  @Roles(...ADMINS)
  @Audit('class.remove_subject', 'ClassSubject')
  removeSubject(
    @Param('id') id: string,
    @Param('courseId') courseId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.academic.removeSubjectFromClass(id, courseId, actor);
  }

  /** Enrols a learner into every subject the class studies. */
  @Post('classes/:id/enroll')
  @Roles(...ADMINS)
  @Audit('class.enroll_student', 'Enrollment')
  enrollInClass(
    @Param('id') id: string,
    @Body() dto: EnrollInClassDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.academic.enrollStudentInClass(dto.studentId, id, dto.batchId, actorId);
  }

  @Get('batches')
  @Roles(...READERS)
  listBatches(
    @CurrentUser() actor: AuthUser,
    @Query('academicYearId') academicYearId?: string,
    @Query('siteId') siteId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.academic.listBatches({
      academicYearId,
      siteId: resolveSiteFilter(actor, siteId),
      classId,
    });
  }

  @Post('batches')
  @Roles(...ADMINS)
  @Audit('batch.create', 'Batch')
  createBatch(@Body() dto: CreateBatchDto) {
    return this.academic.createBatch(dto as any);
  }

  @Patch('batches/:id')
  @Roles(...ADMINS)
  @Audit('batch.update', 'Batch')
  updateBatch(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.academic.updateBatch(id, dto as any);
  }

  @Get('enrollments')
  @Roles(...READERS)
  listEnrollments(
    @Query('courseId') courseId?: string,
    @Query('studentId') studentId?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.academic.listEnrollments({ courseId, studentId, batchId });
  }

  @Post('enrollments')
  @Roles(...ADMINS)
  @Audit('enrollment.create', 'Enrollment')
  enroll(@Body() dto: EnrollDto, @CurrentUser('id') actorId: string) {
    return this.academic.enroll(dto.studentId, dto.courseId, dto.batchId, actorId);
  }

  @Post('enrollments/bulk')
  @Roles(...ADMINS)
  @Audit('enrollment.bulk', 'Enrollment')
  enrollMany(@Body() dto: EnrollManyDto) {
    return this.academic.enrollMany(dto.studentIds, dto.courseId, dto.batchId);
  }

  @Post('enrollments/batch')
  @Roles(...ADMINS)
  @Audit('enrollment.batch', 'Enrollment')
  enrollBatch(@Body() dto: EnrollBatchDto) {
    return this.academic.enrollBatch(dto.batchId, dto.courseId);
  }

  @Patch('enrollments/:id/status')
  @Roles(...ADMINS)
  @Audit('enrollment.set_status', 'Enrollment')
  setStatus(
    @Param('id') id: string,
    @Body() dto: EnrollmentStatusDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.academic.setEnrollmentStatus(id, dto.status, actorId);
  }

  /** Move a learner between batches, keeping the previous batch on record. */
  @Post('enrollments/:id/transfer')
  @Roles(...ADMINS)
  @Audit('enrollment.transfer', 'Enrollment')
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferEnrollmentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.academic.transferEnrollment(id, dto.toBatchId, dto.reason, actorId);
  }

  @Post('enrollments/:id/withdraw')
  @Roles(...ADMINS)
  @Audit('enrollment.withdraw', 'Enrollment')
  withdraw(
    @Param('id') id: string,
    @Body() dto: WithdrawEnrollmentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.academic.withdrawEnrollment(id, dto.reason, actorId);
  }

  @Get('enrollments/:id/history')
  @Roles(...READERS)
  history(@Param('id') id: string) {
    return this.academic.enrollmentHistory(id);
  }
}
