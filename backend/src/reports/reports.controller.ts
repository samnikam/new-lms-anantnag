import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

const READERS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER] as const;
const OVERSIGHT = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.DEPT_OVERSIGHT] as const;

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('enrollment')
  @Roles(...READERS)
  enrollment(
    @Query('courseId') courseId?: string,
    @Query('batchId') batchId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.reports.enrollmentReport({ courseId, batchId, siteId });
  }

  @Get('completion')
  @Roles(...READERS, Role.DEPT_OVERSIGHT)
  completion(@Query('courseId') courseId?: string) {
    return this.reports.completionReport(courseId);
  }

  @Get('attendance')
  @Roles(...READERS)
  attendance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('courseId') courseId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.reports.attendanceReport({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      courseId,
      siteId,
    });
  }

  @Get('assessment')
  @Roles(...READERS)
  assessment(@Query('courseId') courseId?: string) {
    return this.reports.assessmentReport(courseId);
  }

  /** Site-wise utilization — the department oversight rollup. */
  @Get('site-utilization')
  @Roles(...OVERSIGHT)
  siteUtilization(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.siteUtilization(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('activity')
  @Roles(...OVERSIGHT)
  activity(@Query('days') days?: string) {
    return this.reports.activityReport(days ? Number(days) : 30);
  }

  /** CSV export for any of the reports above. */
  @Get('export')
  @Roles(...READERS, Role.DEPT_OVERSIGHT)
  async export(
    @Query('report') report: string,
    @Res() res: Response,
    @Query('courseId') courseId?: string,
    @Query('siteId') siteId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };

    const rows = await (async () => {
      switch (report) {
        case 'enrollment':
          return this.reports.enrollmentReport({ courseId, siteId });
        case 'completion':
          return this.reports.completionReport(courseId);
        case 'attendance':
          return this.reports.attendanceReport({ ...range, courseId, siteId });
        case 'assessment':
          return this.reports.assessmentReport(courseId);
        case 'site-utilization':
          return this.reports.siteUtilization(range.from, range.to);
        default:
          return [];
      }
    })();

    const csv = this.reports.toCsv(rows as any);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${report || 'report'}-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    res.send(csv);
  }
}
