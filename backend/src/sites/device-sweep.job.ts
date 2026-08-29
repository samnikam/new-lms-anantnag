import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SitesService } from './sites.service';

/** Flips panels to OFFLINE when their heartbeat goes stale. */
@Injectable()
export class DeviceSweepJob {
  private readonly logger = new Logger('DeviceSweep');

  constructor(private sites: SitesService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep() {
    const { markedOffline } = await this.sites.markStaleDevicesOffline();
    if (markedOffline > 0) {
      this.logger.warn(`${markedOffline} device(s) went offline (stale heartbeat).`);
    }
  }
}
