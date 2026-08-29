import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { LinkStatus, Role, UserStatus } from '@prisma/client';
import { PageQuery } from '../common/pagination';

export class ListUsersQuery extends PageQuery {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() siteId?: string;
}

export class CreateUserDto {
  @IsString() fullName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() username?: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() locale?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

export class SetStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
}

export class AdminResetPasswordDto {
  @IsString() @MinLength(8) newPassword!: string;
}

export class LinkParentDto {
  @IsString() parentId!: string;
  @IsString() studentId!: string;
  @IsOptional() @IsString() relation?: string;
}

export class LinkStatusDto {
  @IsEnum(LinkStatus) status!: LinkStatus;
}

export class BulkImportDto {
  rows!: Array<{ fullName: string; email?: string; mobile?: string; role: Role; siteCode?: string; password?: string }>;
}
