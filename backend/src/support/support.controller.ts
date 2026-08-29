import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role, TicketSeverity, TicketStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { SupportService } from './support.service';

class CreateTicketDto {
  @IsString() @MinLength(4) subject!: string;
  @IsString() @MinLength(10) body!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(TicketSeverity) severity?: TicketSeverity;
  @IsOptional() @IsString() siteId?: string;
}

class AssignDto {
  @IsString() assigneeId!: string;
}

class NoteDto {
  @IsOptional() @IsString() note?: string;
}

class CommentDto {
  @IsString() @MinLength(1) note!: string;
}

const HANDLERS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN] as const;

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private support: SupportService) {}

  /** Anyone signed in can raise a grievance. */
  @Post()
  @Audit('ticket.create', 'SupportTicket')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.create(user.id, { ...dto, siteId: dto.siteId ?? user.siteId ?? undefined });
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: TicketStatus,
    @Query('severity') severity?: TicketSeverity,
    @Query('siteId') siteId?: string,
  ) {
    const isHandler = HANDLERS.includes(user.role as any);
    return this.support.list({
      status,
      severity,
      siteId,
      requesterId: isHandler ? undefined : user.id,
    });
  }

  @Get('sla-board')
  @Roles(...HANDLERS, Role.DEPT_OVERSIGHT)
  slaBoard() {
    return this.support.slaBoard();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.support.findOne(id);
  }

  @Post(':id/assign')
  @Roles(...HANDLERS)
  @Audit('ticket.assign', 'SupportTicket')
  assign(@Param('id') id: string, @Body() dto: AssignDto, @CurrentUser('id') actorId: string) {
    return this.support.assign(id, dto.assigneeId, actorId);
  }

  @Post(':id/escalate')
  @Roles(...HANDLERS)
  @Audit('ticket.escalate', 'SupportTicket')
  escalate(@Param('id') id: string, @Body() dto: NoteDto, @CurrentUser('id') actorId: string) {
    return this.support.escalate(id, actorId, dto.note);
  }

  @Post(':id/comment')
  comment(@Param('id') id: string, @Body() dto: CommentDto, @CurrentUser('id') actorId: string) {
    return this.support.comment(id, actorId, dto.note);
  }

  @Post(':id/resolve')
  @Roles(...HANDLERS)
  @Audit('ticket.resolve', 'SupportTicket')
  resolve(@Param('id') id: string, @Body() dto: NoteDto, @CurrentUser('id') actorId: string) {
    return this.support.resolve(id, actorId, dto.note);
  }

  @Post(':id/close')
  @Roles(...HANDLERS)
  @Audit('ticket.close', 'SupportTicket')
  close(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.support.close(id, actorId);
  }
}
