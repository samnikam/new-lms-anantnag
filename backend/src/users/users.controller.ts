import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LinkStatus, Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import {
  AdminResetPasswordDto,
  BulkImportDto,
  CreateUserDto,
  LinkParentDto,
  LinkStatusDto,
  ListUsersQuery,
  SetStatusDto,
  UpdateUserDto,
} from './dto';

const ADMINS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN] as const;

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(...ADMINS)
  list(@Query() q: ListUsersQuery, @CurrentUser() actor: AuthUser) {
    return this.users.list(q, actor);
  }

  /** The roles the signed-in admin may assign, for the creation form. */
  @Get('assignable-roles')
  @Roles(...ADMINS)
  assignableRoles(@CurrentUser('role') role: Role) {
    return this.users.assignableRolesFor(role);
  }

  @Get('my-children')
  @Roles(Role.PARENT)
  myChildren(@CurrentUser('id') parentId: string) {
    return this.users.childrenOf(parentId);
  }

  @Get('links')
  @Roles(...ADMINS)
  listLinks(@Query('parentId') parentId?: string, @Query('studentId') studentId?: string) {
    return this.users.listLinks({ parentId, studentId });
  }

  @Get(':id')
  @Roles(...ADMINS)
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Roles(...ADMINS)
  @Audit('user.create', 'User')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.role, actor);
  }

  @Post('bulk-import')
  @Roles(...ADMINS)
  @Audit('user.bulk_import', 'User')
  bulkImport(@Body() dto: BulkImportDto, @CurrentUser() actor: AuthUser) {
    return this.users.bulkImport(dto.rows ?? [], actor.role);
  }

  @Patch(':id')
  @Roles(...ADMINS)
  @Audit('user.update', 'User')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor.role, actor);
  }

  @Patch(':id/status')
  @Roles(...ADMINS)
  @Audit('user.set_status', 'User')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setStatus(id, dto.status, actor.role, actor);
  }

  @Post(':id/reset-password')
  @Roles(...ADMINS)
  @Audit('user.admin_reset_password', 'User')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.resetPasswordByAdmin(id, dto.newPassword, actor.role, actor);
  }

  @Post('links')
  @Roles(...ADMINS)
  @Audit('parent_link.create', 'ParentStudentLink')
  link(@Body() dto: LinkParentDto) {
    return this.users.linkParent(dto.parentId, dto.studentId, dto.relation);
  }

  @Patch('links/:id')
  @Roles(...ADMINS)
  @Audit('parent_link.set_status', 'ParentStudentLink')
  setLinkStatus(
    @Param('id') id: string,
    @Body() dto: LinkStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.setLinkStatus(id, dto.status as LinkStatus, user.id);
  }
}
