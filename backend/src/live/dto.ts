import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SessionMode, SessionStatus } from '@prisma/client';

export class ListSessionsQuery {
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsEnum(SessionStatus) status?: SessionStatus;
  @IsOptional() @IsString() classroomId?: string;
}

export class ScheduleSessionDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsEnum(SessionMode) mode!: SessionMode;
  @IsOptional() @IsString() originRoomId?: string;
  @Type(() => Date) @IsDate() scheduledStart!: Date;
  @Type(() => Date) @IsDate() scheduledEnd!: Date;
  @IsOptional() @IsArray() @IsString({ each: true }) targetClassroomIds?: string[];
  @IsOptional() @IsBoolean() moderatedQA?: boolean;
  @IsOptional() @IsBoolean() createZoomMeeting?: boolean;
}

export class UpdateTargetsDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) classroomIds!: string[];
}

export class EndSessionDto {
  @IsOptional() @IsString() recordingUrl?: string;
}

export class AskQuestionDto {
  @IsString() body!: string;
}

export class ModerateQuestionDto {
  @IsBoolean() approved!: boolean;
}

export class ReportDropDto {
  @IsOptional() @IsString() classroomId?: string;
}

export class RoomAttendanceDto {
  @IsOptional() @IsString() classroomId?: string;
  @IsInt() @Min(0) headcount!: number;
  @IsOptional() @IsString() remarks?: string;
}
