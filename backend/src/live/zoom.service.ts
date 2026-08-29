import { Injectable, Logger } from '@nestjs/common';

export interface CreatedMeeting {
  id: string;
  joinUrl: string;
  startUrl: string;
  streamUrl?: string;
}

/**
 * Zoom Server-to-Server OAuth integration.
 *
 * The bid lists a Zoom subscription separately; credentials are supplied at
 * deployment. Until they are configured the service issues deterministic
 * placeholder links so the scheduling flow is fully testable without Zoom.
 */
@Injectable()
export class ZoomService {
  private readonly logger = new Logger('Zoom');
  private token?: { value: string; expiresAt: number };

  private get configured() {
    return Boolean(
      process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET,
    );
  }

  async createMeeting(input: {
    topic: string;
    startTime: Date;
    durationMin: number;
  }): Promise<CreatedMeeting> {
    if (!this.configured) {
      const id = `local-${Date.now().toString(36)}`;
      this.logger.warn('Zoom credentials are not configured — issuing a placeholder meeting link.');
      return {
        id,
        joinUrl: `https://zoom.invalid/j/${id}`,
        startUrl: `https://zoom.invalid/s/${id}`,
        streamUrl: `/relay/${id}/index.m3u8`,
      };
    }

    const accessToken = await this.getToken();
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // scheduled
        start_time: input.startTime.toISOString(),
        duration: input.durationMin,
        settings: {
          auto_recording: 'cloud', // recordings are auto-linked back to courses
          join_before_host: false,
          mute_upon_entry: true, // 42 endpoints must not compete on one call
          waiting_room: false,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Zoom meeting creation failed: ${res.status} ${detail}`);
      throw new Error('Could not create the Zoom meeting. Check the Zoom configuration.');
    }

    const meeting: any = await res.json();
    return {
      id: String(meeting.id),
      joinUrl: meeting.join_url,
      startUrl: meeting.start_url,
      streamUrl: meeting.settings?.custom_live_streaming_service,
    };
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;

    const basic = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`,
    ).toString('base64');

    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
    );
    if (!res.ok) throw new Error('Zoom authentication failed.');

    const body: any = await res.json();
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return this.token.value;
  }
}
