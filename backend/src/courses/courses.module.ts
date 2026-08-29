import { Module } from '@nestjs/common';
import { ContentController, CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  controllers: [CoursesController, ContentController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
