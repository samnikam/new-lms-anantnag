import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  /** One endpoint; the payload is shaped by the caller role. */
  @Get()
  forUser(@CurrentUser() user: AuthUser) {
    return this.dashboard.forUser(user);
  }
}
