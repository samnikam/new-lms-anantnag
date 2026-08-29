import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AcademicService } from './academic.service';
import {
  CreateBatchDto,
  CreateYearDto,
  EnrollBatchDto,
  EnrollDto,
  EnrollManyDto,
  EnrollmentStatusDto,
  UpdateBatchDto,
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

  @Get('batches')
  @Roles(...READERS)
  listBatches(@Query('academicYearId') academicYearId?: string, @Query('siteId') siteId?: string) {
    return this.academic.listBatches({ academicYearId, siteId });
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
  enroll(@Body() dto: EnrollDto) {
    return this.academic.enroll(dto.studentId, dto.courseId, dto.batchId);
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
  setStatus(@Param('id') id: string, @Body() dto: EnrollmentStatusDto) {
    return this.academic.setEnrollmentStatus(id, dto.status);
  }
}
