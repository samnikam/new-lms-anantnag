import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { ZoomService } from './zoom.service';
import { BroadcastGateway } from './broadcast.gateway';

@Module({
  controllers: [LiveController],
  providers: [LiveService, ZoomService, BroadcastGateway],
  exports: [LiveService],
})
export class LiveModule {}
