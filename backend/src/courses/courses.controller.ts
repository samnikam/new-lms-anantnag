import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PageQuery } from '../common/pagination';
import { CoursesService } from './courses.service';
import {
  AssignTeacherDto,
  CloneCourseDto,
  CreateCourseDto,
  CreateLessonDto,
  CreateModuleDto,
  CreateResourceDto,
  ListCoursesQuery,
  ReorderDto,
  SetStateDto,
  UpdateCourseDto,
  UpdateLessonDto,
  UpdateModuleDto,
  UpdateResourceDto,
} from './dto';

const AUTHORS = [Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER, Role.CONTENT_MANAGER] as const;
const ALL = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_ADMIN,
  Role.TEACHER,
  Role.CONTENT_MANAGER,
  Role.STUDENT,
  Role.PARENT,
  Role.DEPT_OVERSIGHT,
] as const;

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private courses: CoursesService) {}

  @Get()
  @Roles(...ALL)
  list(@Query() q: ListCoursesQuery, @CurrentUser() user: AuthUser) {
    return this.courses.list(q, user);
  }

  @Get('library')
  @Roles(...AUTHORS)
  library(@Query() q: PageQuery) {
    return this.courses.library(q);
  }

  @Get(':id')
  @Roles(...ALL)
  findOne(@Param('id') id: string) {
    return this.courses.findOne(id);
  }

  @Get(':id/player')
  @Roles(Role.STUDENT)
  player(@Param('id') id: string, @CurrentUser('id') studentId: string) {
    return this.courses.player(id, studentId);
  }

  @Post()
  @Roles(...AUTHORS)
  @Audit('course.create', 'Course')
  create(@Body() dto: CreateCourseDto) {
    return this.courses.create(dto as any);
  }

  @Patch(':id')
  @Roles(...AUTHORS)
  @Audit('course.update', 'Course')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(id, dto as any);
  }

  @Patch(':id/state')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.CONTENT_MANAGER)
  @Audit('course.set_state', 'Course')
  setState(@Param('id') id: string, @Body() dto: SetStateDto) {
    return this.courses.setState(id, dto.state);
  }

  @Post(':id/clone')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.CONTENT_MANAGER)
  @Audit('course.clone', 'Course')
  clone(@Param('id') id: string, @Body() dto: CloneCourseDto) {
    return this.courses.clone(id, dto.newCode);
  }

  @Post(':id/teachers')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('course.assign_teacher', 'CourseTeacher')
  assignTeacher(@Param('id') id: string, @Body() dto: AssignTeacherDto) {
    return this.courses.assignTeacher(id, dto.teacherId, dto.isLead);
  }

  @Delete(':id/teachers/:teacherId')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('course.remove_teacher', 'CourseTeacher')
  removeTeacher(@Param('id') id: string, @Param('teacherId') teacherId: string) {
    return this.courses.removeTeacher(id, teacherId);
  }
}

@ApiTags('content')
@Controller()
export class ContentController {
  constructor(private courses: CoursesService) {}

  @Post('modules')
  @Roles(...AUTHORS)
  @Audit('module.create', 'Module')
  createModule(@Body() dto: CreateModuleDto) {
    return this.courses.createModule(dto as any);
  }

  @Patch('modules/:id')
  @Roles(...AUTHORS)
  updateModule(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return this.courses.updateModule(id, dto as any);
  }

  @Delete('modules/:id')
  @Roles(...AUTHORS)
  @Audit('module.delete', 'Module')
  deleteModule(@Param('id') id: string) {
    return this.courses.deleteModule(id);
  }

  @Post('lessons')
  @Roles(...AUTHORS)
  @Audit('lesson.create', 'Lesson')
  createLesson(@Body() dto: CreateLessonDto) {
    return this.courses.createLesson(dto as any);
  }

  @Patch('lessons/:id')
  @Roles(...AUTHORS)
  updateLesson(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.courses.updateLesson(id, dto as any);
  }

  @Delete('lessons/:id')
  @Roles(...AUTHORS)
  @Audit('lesson.delete', 'Lesson')
  deleteLesson(@Param('id') id: string) {
    return this.courses.deleteLesson(id);
  }

  @Post('lessons/reorder')
  @Roles(...AUTHORS)
  reorder(@Body() dto: ReorderDto) {
    return this.courses.reorderLessons(dto.moduleId, dto.orderedIds);
  }

  @Post('resources')
  @Roles(...AUTHORS)
  @Audit('resource.create', 'Resource')
  addResource(@Body() dto: CreateResourceDto) {
    return this.courses.addResource(dto as any);
  }

  @Patch('resources/:id')
  @Roles(...AUTHORS)
  updateResource(@Param('id') id: string, @Body() dto: UpdateResourceDto) {
    return this.courses.updateResource(id, dto as any);
  }

  @Delete('resources/:id')
  @Roles(...AUTHORS)
  @Audit('resource.delete', 'Resource')
  deleteResource(@Param('id') id: string) {
    return this.courses.deleteResource(id);
  }
}
