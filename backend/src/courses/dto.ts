import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ContentState, ResourceType } from '@prisma/client';
import { PageQuery } from '../common/pagination';

export class ListCoursesQuery extends PageQuery {
  @IsOptional() @IsEnum(ContentState) state?: ContentState;
  @IsOptional() @IsString() category?: string;
}

export class CreateCourseDto {
  @IsString() code!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() objectives?: string;
  @IsOptional() @IsInt() durationHours?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) requiredLessonPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) requiredQuizPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) passMark?: number;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() objectives?: string;
  @IsOptional() @IsInt() durationHours?: number;
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) requiredLessonPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) requiredQuizPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) passMark?: number;
}

export class SetStateDto {
  @IsEnum(ContentState) state!: ContentState;
}

export class CloneCourseDto {
  @IsString() newCode!: string;
}

export class AssignTeacherDto {
  @IsString() teacherId!: string;
  @IsOptional() @IsBoolean() isLead?: boolean;
}

export class CreateModuleDto {
  @IsString() courseId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() position?: number;
}

export class UpdateModuleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() position?: number;
}

export class CreateLessonDto {
  @IsString() moduleId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsInt() position?: number;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  // Authors publish a lesson as they add it; without this the request is
  // rejected outright by the whitelist validator.
  @IsOptional() @IsEnum(ContentState) state?: ContentState;
}

export class UpdateLessonDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsInt() position?: number;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsEnum(ContentState) state?: ContentState;
}

export class ReorderDto {
  @IsString() moduleId!: string;
  @IsArray() @IsString({ each: true }) orderedIds!: string[];
}

export class CreateResourceDto {
  @IsOptional() @IsString() lessonId?: string;
  @IsString() title!: string;
  @IsEnum(ResourceType) type!: ResourceType;
  @IsString() url!: string;
  @IsOptional() @IsString() fileKey?: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsInt() sizeBytes?: number;
  @IsOptional() @IsInt() position?: number;
  @IsOptional() @IsBoolean() isDownloadable?: boolean;
  @IsOptional() @IsBoolean() inLibrary?: boolean;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsInt() position?: number;
  @IsOptional() @IsBoolean() isDownloadable?: boolean;
  @IsOptional() @IsBoolean() inLibrary?: boolean;
  @IsOptional() @IsEnum(ContentState) state?: ContentState;
}
