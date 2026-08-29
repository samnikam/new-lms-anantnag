import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role, SessionStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { LiveService } from './live.service';
import {
  AskQuestionDto,
  EndSessionDto,
  ListSessionsQuery,
  ModerateQuestionDto,
  ReportDropDto,
  RoomAttendanceDto,
  ScheduleSessionDto,
  UpdateTargetsDto,
} from './dto';

const HOSTS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER] as const;
const VIEWERS = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_ADMIN,
  Role.TEACHER,
  Role.STUDENT,
  Role.PARENT,
  Role.DEPT_OVERSIGHT,
] as const;

@ApiTags('live-sessions')
@Controller('live-sessions')
export class LiveController {
  constructor(private live: LiveService) {}

  @Get()
  @Roles(...VIEWERS)
  list(@Query() q: ListSessionsQuery, @CurrentUser() user: AuthUser) {
    return this.live.list({ ...q, status: q.status as SessionStatus, user });
  }

  /** What the kiosk panel opens on boot — today's schedule for this room. */
  @Get('classroom/:classroomId/today')
  todayForRoom(@Param('classroomId') classroomId: string) {
    return this.live.todayForClassroom(classroomId);
  }

  @Get(':id')
  @Roles(...VIEWERS)
  findOne(@Param('id') id: string) {
    return this.live.findOne(id);
  }

  @Get(':id/join')
  join(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.live.join(id, user);
  }

  @Get(':id/questions')
  listQuestions(
    @Param('id') id: string,
    @Query('all') all: string,
    @CurrentUser() user: AuthUser,
  ) {
    const moderators: Role[] = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER];
    const canSeeUnmoderated = moderators.includes(user.role);
    return this.live.listQuestions(id, !(all === 'true' && canSeeUnmoderated));
  }

  @Post()
  @Roles(...HOSTS)
  @Audit('live_session.schedule', 'LiveSession')
  schedule(@Body() dto: ScheduleSessionDto, @CurrentUser() user: AuthUser) {
    return this.live.schedule(dto, user);
  }

  @Patch(':id/targets')
  @Roles(...HOSTS)
  @Audit('live_session.update_targets', 'LiveSession')
  updateTargets(@Param('id') id: string, @Body() dto: UpdateTargetsDto) {
    return this.live.updateTargets(id, dto.classroomIds);
  }

  @Post(':id/start')
  @Roles(...HOSTS)
  @Audit('live_session.start', 'LiveSession')
  start(@Param('id') id: string, @CurrentUser('id') hostId: string) {
    return this.live.start(id, hostId);
  }

  @Post(':id/end')
  @Roles(...HOSTS)
  @Audit('live_session.end', 'LiveSession')
  end(@Param('id') id: string, @Body() dto: EndSessionDto) {
    return this.live.end(id, dto.recordingUrl);
  }

  @Post(':id/cancel')
  @Roles(...HOSTS)
  @Audit('live_session.cancel', 'LiveSession')
  cancel(@Param('id') id: string) {
    return this.live.cancel(id);
  }

  @Post(':id/questions')
  ask(@Param('id') id: string, @Body() dto: AskQuestionDto, @CurrentUser() user: AuthUser) {
    return this.live.askQuestion(id, dto.body, user);
  }

  @Patch('questions/:questionId')
  @Roles(...HOSTS)
  moderate(@Param('questionId') questionId: string, @Body() dto: ModerateQuestionDto) {
    return this.live.moderateQuestion(questionId, dto.approved);
  }

  @Post(':id/connection-lost')
  reportDrop(@Param('id') id: string, @Body() dto: ReportDropDto, @CurrentUser() user: AuthUser) {
    return this.live.reportConnectionLoss(id, user.kioskClassroomId ?? dto.classroomId);
  }

  @Post(':id/room-attendance')
  @Audit('attendance.room_level', 'Attendance')
  roomAttendance(
    @Param('id') id: string,
    @Body() dto: RoomAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.live.markRoomAttendance(
      id,
      user.kioskClassroomId ?? dto.classroomId,
      dto.headcount,
      // A kiosk session is a device, not a person: there is no User to attribute
      // the mark to, so the room record is left unattributed rather than
      // pointing at a non-existent user.
      user.kioskClassroomId ? null : user.id,
      dto.remarks,
    );
  }
}
