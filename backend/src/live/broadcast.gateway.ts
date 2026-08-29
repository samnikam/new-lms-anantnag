import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Realtime control channel for the hub-and-spoke broadcast.
 *
 * The studio publishes control events once; every subscribed classroom panel
 * receives them simultaneously. Media itself rides the Zoom/relay stream — this
 * channel carries session state, moderated Q&A and per-room health only.
 */
@WebSocketGateway({
  namespace: '/broadcast',
  cors: { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true },
})
export class BroadcastGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Broadcast');

  handleConnection(client: Socket) {
    this.logger.debug(`Endpoint connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const { sessionId, classroomId } = client.data ?? {};
    if (sessionId && classroomId) {
      this.server.to(room(sessionId)).emit('room:left', { classroomId });
    }
  }

  /** A classroom panel subscribes to the session it is targeted by. */
  @SubscribeMessage('room:join')
  joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; classroomId: string; classroomName?: string },
  ) {
    client.data = payload;
    client.join(room(payload.sessionId));
    this.server.to(room(payload.sessionId)).emit('room:joined', payload);
    return { ok: true };
  }

  /** Studio-side control: start, pause, end, slide change. */
  @SubscribeMessage('studio:control')
  control(@MessageBody() payload: { sessionId: string; action: string; data?: unknown }) {
    this.server.to(room(payload.sessionId)).emit('studio:control', payload);
    return { ok: true };
  }

  /** A classroom raises a hand; the studio moderates before it is aired. */
  @SubscribeMessage('room:question')
  question(
    @MessageBody() payload: { sessionId: string; classroomId: string; body: string },
  ) {
    this.server.to(room(payload.sessionId)).emit('room:question', payload);
    return { ok: true };
  }

  /** Per-room link health, so the studio sees which sites have degraded. */
  @SubscribeMessage('room:health')
  health(
    @MessageBody() payload: { sessionId: string; classroomId: string; online: boolean; bitrateKbps?: number },
  ) {
    this.server.to(room(payload.sessionId)).emit('room:health', payload);
    return { ok: true };
  }
}

function room(sessionId: string) {
  return `session:${sessionId}`;
}
