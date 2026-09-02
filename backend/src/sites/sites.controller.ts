import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DeviceStatus, DeviceType, InstitutionType, Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SitesService } from './sites.service';
import {
  CreateClassroomDto,
  CreateSiteDto,
  HeartbeatDto,
  RegisterDeviceDto,
  UpdateClassroomDto,
  UpdateDeviceDto,
  UpdateSiteDto,
} from './dto';

const VIEWERS = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_ADMIN,
  Role.TEACHER,
  Role.DEPT_OVERSIGHT,
] as const;

@ApiTags('sites')
@Controller()
export class SitesController {
  constructor(private sites: SitesService) {}

  @Get('sites')
  @Roles(...VIEWERS)
  listSites(
    @Query('search') search?: string,
    @Query('type') type?: InstitutionType,
    @Query('active') active?: string,
  ) {
    return this.sites.listSites({
      search,
      type,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get('sites/status-board')
  @Roles(...VIEWERS)
  statusBoard() {
    return this.sites.statusBoard();
  }

  @Get('sites/:id')
  @Roles(...VIEWERS)
  getSite(@Param('id') id: string) {
    return this.sites.getSite(id);
  }

  @Get('sites/:id/stats')
  @Roles(...VIEWERS)
  siteStats(@Param('id') id: string) {
    return this.sites.siteStats(id);
  }

  @Post('sites')
  @Roles(Role.SUPER_ADMIN)
  @Audit('site.create', 'Site')
  createSite(@Body() dto: CreateSiteDto) {
    return this.sites.createSite(dto);
  }

  @Patch('sites/:id')
  @Roles(Role.SUPER_ADMIN)
  @Audit('site.update', 'Site')
  updateSite(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sites.updateSite(id, dto);
  }

  @Delete('sites/:id')
  @Roles(Role.SUPER_ADMIN)
  @Audit('site.delete', 'Site')
  deleteSite(@Param('id') id: string) {
    return this.sites.deleteSite(id);
  }

  @Get('classrooms')
  @Roles(...VIEWERS)
  listClassrooms(@Query('siteId') siteId?: string) {
    return this.sites.listClassrooms(siteId);
  }

  @Post('classrooms')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('classroom.create', 'Classroom')
  createClassroom(@Body() dto: CreateClassroomDto) {
    return this.sites.createClassroom(dto);
  }

  @Patch('classrooms/:id')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('classroom.update', 'Classroom')
  updateClassroom(@Param('id') id: string, @Body() dto: UpdateClassroomDto) {
    return this.sites.updateClassroom(id, dto);
  }

  @Get('devices')
  @Roles(...VIEWERS)
  listDevices(
    @Query('classroomId') classroomId?: string,
    @Query('siteId') siteId?: string,
    @Query('status') status?: DeviceStatus,
    @Query('type') type?: DeviceType,
  ) {
    return this.sites.listDevices({ classroomId, siteId, status, type });
  }

  @Post('devices')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('device.register', 'Device')
  register(@Body() dto: RegisterDeviceDto) {
    return this.sites.registerDevice(dto);
  }

  @Patch('devices/:id')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('device.update', 'Device')
  updateDevice(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.sites.updateDevice(id, dto);
  }

  /**
   * Unauthenticated by design: the classroom agent identifies itself by a
   * pre-registered serial number and can only report liveness, never read data.
   */
  @Public()
  @Post('devices/heartbeat')
  heartbeat(@Body() dto: HeartbeatDto) {
    const { serialNo, ...metrics } = dto;
    return this.sites.heartbeat(serialNo, metrics);
  }
}
