import { IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { DeviceStatus, DeviceType, InstitutionType } from '@prisma/client';

export class CreateSiteDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsEnum(InstitutionType) type?: InstitutionType;
  @IsOptional() @IsString() consigneeAddr?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() internetLink?: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(InstitutionType) type?: InstitutionType;
  @IsOptional() @IsString() consigneeAddr?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() internetLink?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateClassroomDto {
  @IsString() siteId!: string;
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsInt() capacity?: number;
  @IsOptional() @IsBoolean() isStudio?: boolean;
  @IsOptional() @IsString() kioskUsername?: string;
  @IsOptional() @IsString() @MinLength(6) kioskPassword?: string;
}

export class UpdateClassroomDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() capacity?: number;
  @IsOptional() @IsBoolean() isStudio?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() kioskUsername?: string;
  @IsOptional() @IsString() @MinLength(6) kioskPassword?: string;
}

export class RegisterDeviceDto {
  @IsString() classroomId!: string;
  @IsEnum(DeviceType) type!: DeviceType;
  @IsString() serialNo!: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateDeviceDto {
  @IsOptional() @IsEnum(DeviceStatus) status?: DeviceStatus;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() notes?: string;
}

export class HeartbeatDto {
  @IsString() serialNo!: string;
  @IsOptional() @IsNumber() cpu?: number;
  @IsOptional() @IsNumber() memory?: number;
  @IsOptional() @IsNumber() bandwidth?: number;
  @IsOptional() @IsString() appVersion?: string;
  @IsOptional() @IsString() ipAddress?: string;
}
