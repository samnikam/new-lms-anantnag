import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { EnrollmentStatus } from '@prisma/client';

export class CreateYearDto {
  @IsString() name!: string;
  @Type(() => Date) @IsDate() startDate!: Date;
  @Type(() => Date) @IsDate() endDate!: Date;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
}

export class CreateClassDto {
  @IsString() academicYearId!: string;
  @IsString() siteId!: string;
  @IsString() name!: string;
  @IsOptional() @IsInt() level?: number;
  @IsOptional() @IsString() description?: string;
}

export class UpdateClassDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() level?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AddClassSubjectDto {
  @IsString() courseId!: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsInt() periodsPerWeek?: number;
}

export class EnrollInClassDto {
  @IsString() studentId!: string;
  @IsOptional() @IsString() batchId?: string;
}

export class CreateBatchDto {
  @IsString() academicYearId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() classId?: string;
}

export class UpdateBatchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class EnrollDto {
  @IsString() studentId!: string;
  @IsString() courseId!: string;
  @IsOptional() @IsString() batchId?: string;
}

export class EnrollManyDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) studentIds!: string[];
  @IsString() courseId!: string;
  @IsOptional() @IsString() batchId?: string;
}

export class EnrollBatchDto {
  @IsString() batchId!: string;
  @IsString() courseId!: string;
}

export class EnrollmentStatusDto {
  @IsEnum(EnrollmentStatus) status!: EnrollmentStatus;
}

export class TransferEnrollmentDto {
  @IsString() toBatchId!: string;
  @IsOptional() @IsString() reason?: string;
}

export class WithdrawEnrollmentDto {
  @IsOptional() @IsString() reason?: string;
}
