import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { DeviceSweepJob } from './device-sweep.job';

@Module({
  controllers: [SitesController],
  providers: [SitesService, DeviceSweepJob],
  exports: [SitesService],
})
export class SitesModule {}
