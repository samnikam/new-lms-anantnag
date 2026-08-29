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
  list(@Query() q: ListUsersQuery) {
    return this.users.list(q);
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
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Post('bulk-import')
  @Roles(...ADMINS)
  @Audit('user.bulk_import', 'User')
  bulkImport(@Body() dto: BulkImportDto) {
    return this.users.bulkImport(dto.rows ?? []);
  }

  @Patch(':id')
  @Roles(...ADMINS)
  @Audit('user.update', 'User')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN)
  @Audit('user.set_status', 'User')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.users.setStatus(id, dto.status);
  }

  @Post(':id/reset-password')
  @Roles(Role.SUPER_ADMIN)
  @Audit('user.admin_reset_password', 'User')
  resetPassword(@Param('id') id: string, @Body() dto: AdminResetPasswordDto) {
    return this.users.resetPasswordByAdmin(id, dto.newPassword);
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
