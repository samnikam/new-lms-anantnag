import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProctorFlagType, QuestionType, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QuizService } from './quiz.service';

class OptionDto {
  @IsString() body!: string;
  @IsBoolean() isCorrect!: boolean;
}

class CreateQuestionDto {
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() topic?: string;
  @IsEnum(QuestionType) type!: QuestionType;
  @IsString() body!: string;
  @IsOptional() @IsNumber() marks?: number;
  @IsOptional() @IsNumber() negativeMarks?: number;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @IsString() difficulty?: string;
  @IsOptional() @IsArray() @Type(() => OptionDto) options?: OptionDto[];
}

class UpdateQuestionDto {
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsNumber() marks?: number;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @IsString() difficulty?: string;
  @IsOptional() @IsArray() @Type(() => OptionDto) options?: OptionDto[];
}

class CreateQuizDto {
  @IsString() courseId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) durationMin?: number;
  @IsOptional() @IsInt() @Min(1) maxAttempts?: number;
  @IsOptional() @IsInt() passMark?: number;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() proctoringEnabled?: boolean;
  @IsOptional() @IsInt() maxTabSwitches?: number;
  @IsOptional() @IsBoolean() lockTimer?: boolean;
  @IsOptional() @Type(() => Date) @IsDate() opensAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() closesAt?: Date;
}

class QuizQuestionItem {
  @IsString() questionId!: string;
  @IsOptional() @IsNumber() marks?: number;
}

class SetQuestionsDto {
  @IsArray() @Type(() => QuizQuestionItem) items!: QuizQuestionItem[];
}

class SaveAnswerDto {
  @IsString() questionId!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) selectedIds?: string[];
  @IsOptional() @IsString() textAnswer?: string;
}

class FlagDto {
  @IsEnum(ProctorFlagType) type!: ProctorFlagType;
  @IsOptional() @IsString() detail?: string;
}

class ReviewDto {
  @IsNumber() @Min(0) awardedMarks!: number;
}

const AUTHORS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER] as const;

@ApiTags('assessment')
@Controller()
export class QuizController {
  constructor(private quiz: QuizService) {}

  // ─── Question bank ───

  @Get('questions')
  @Roles(...AUTHORS, Role.CONTENT_MANAGER)
  listQuestions(
    @Query('courseId') courseId?: string,
    @Query('topic') topic?: string,
    @Query('type') type?: QuestionType,
  ) {
    return this.quiz.listQuestions({ courseId, topic, type });
  }

  @Post('questions')
  @Roles(...AUTHORS, Role.CONTENT_MANAGER)
  @Audit('question.create', 'Question')
  createQuestion(@Body() dto: CreateQuestionDto) {
    return this.quiz.createQuestion(dto);
  }

  @Patch('questions/:id')
  @Roles(...AUTHORS, Role.CONTENT_MANAGER)
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.quiz.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @Roles(...AUTHORS)
  @Audit('question.delete', 'Question')
  deleteQuestion(@Param('id') id: string) {
    return this.quiz.deleteQuestion(id);
  }

  // ─── Quizzes ───

  @Get('quizzes')
  listQuizzes(@CurrentUser('role') role: Role, @Query('courseId') courseId?: string) {
    return this.quiz.listQuizzes({ courseId, publishedOnly: role === Role.STUDENT });
  }

  @Post('quizzes')
  @Roles(...AUTHORS)
  @Audit('quiz.create', 'Quiz')
  createQuiz(@Body() dto: CreateQuizDto) {
    return this.quiz.createQuiz(dto as any);
  }

  @Patch('quizzes/:id')
  @Roles(...AUTHORS)
  updateQuiz(@Param('id') id: string, @Body() dto: Partial<CreateQuizDto>) {
    return this.quiz.updateQuiz(id, dto as any);
  }

  @Post('quizzes/:id/questions')
  @Roles(...AUTHORS)
  setQuestions(@Param('id') id: string, @Body() dto: SetQuestionsDto) {
    return this.quiz.setQuestions(id, dto.items);
  }

  @Post('quizzes/:id/publish')
  @Roles(...AUTHORS)
  @Audit('quiz.publish', 'Quiz')
  publish(@Param('id') id: string) {
    return this.quiz.publishQuiz(id);
  }

  @Post('quizzes/:id/publish-results')
  @Roles(...AUTHORS)
  @Audit('quiz.publish_results', 'Quiz')
  publishResults(@Param('id') id: string) {
    return this.quiz.publishResults(id);
  }

  @Get('quizzes/:id/results')
  @Roles(...AUTHORS)
  results(@Param('id') id: string) {
    return this.quiz.quizResults(id);
  }

  // ─── Attempts ───

  @Post('quizzes/:id/attempts')
  @Roles(Role.STUDENT)
  start(@Param('id') id: string, @CurrentUser('id') studentId: string) {
    return this.quiz.startAttempt(id, studentId);
  }

  @Get('quizzes/:id/my-attempts')
  @Roles(Role.STUDENT)
  history(@Param('id') id: string, @CurrentUser('id') studentId: string) {
    return this.quiz.attemptHistory(id, studentId);
  }

  @Post('attempts/:attemptId/answers')
  @Roles(Role.STUDENT)
  saveAnswer(
    @Param('attemptId') attemptId: string,
    @Body() dto: SaveAnswerDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.quiz.saveAnswer(attemptId, studentId, dto);
  }

  @Post('attempts/:attemptId/flags')
  @Roles(Role.STUDENT)
  flag(
    @Param('attemptId') attemptId: string,
    @Body() dto: FlagDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.quiz.flag(attemptId, studentId, dto.type, dto.detail);
  }

  @Post('attempts/:attemptId/submit')
  @Roles(Role.STUDENT)
  submit(@Param('attemptId') attemptId: string, @CurrentUser('id') studentId: string) {
    return this.quiz.submitAttempt(attemptId, studentId);
  }

  @Post('answers/:answerId/review')
  @Roles(...AUTHORS)
  @Audit('quiz.manual_review', 'AttemptAnswer')
  review(@Param('answerId') answerId: string, @Body() dto: ReviewDto) {
    return this.quiz.reviewAnswer(answerId, dto.awardedMarks);
  }
}
