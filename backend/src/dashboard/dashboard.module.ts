import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ProgressModule } from '../progress/progress.module';
import { ReportsModule } from '../reports/reports.module';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AttendanceModule, ProgressModule, ReportsModule, UsersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
