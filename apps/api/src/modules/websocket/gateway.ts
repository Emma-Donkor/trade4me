import { createAdapter } from '@socket.io/redis-adapter';
import { Inject, Injectable } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { verify } from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { env } from '@ts/config';
import type { WebSocketEvent, WebSocketEventName } from '@ts/types';
import { configuration } from '../../config/configuration';
import { JsonLogger } from '../../common/logger/json-logger';
import { RedisService } from '../redis/redis.service';

function handshakeToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  if (typeof auth?.token === 'string') return auth.token;
  const header = socket.handshake.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
  return match?.[1];
}

/** Authenticated Socket.IO gateway using Redis for horizontal scaling. */
@Injectable()
@WebSocketGateway({
  namespace: '/',
  cors: { origin: configuration.cors.origins, credentials: true },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server | undefined;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    // Socket.IO v4 exposes `adapter` as a settable property, not a method.
    // The Redis adapter is a factory, so bypass Socket.IO's constructor-only typings.
    (server as { adapter: unknown }).adapter = createAdapter(
      this.redis.getPublisher(),
      this.redis.getSubscriber(),
    );
  }

  handleConnection(client: Socket): void {
    const token = handshakeToken(client);
    const secret = env.JWT_SECRET ? String(env.JWT_SECRET) : '';

    if (!token) {
      if (String(env.NODE_ENV) === 'production') {
        client.disconnect(true);
        return;
      }
      client.data.user = { id: 'dev-user', roles: [] };
      return;
    }
    if (!secret) {
      this.logger.warn('WS handshake rejected: JWT secret not configured', 'WS');
      client.disconnect(true);
      return;
    }
    try {
      client.data.user = verify(token, secret);
    } catch {
      client.disconnect(true);
    }
  }

  /** Emits the README §8.3 envelope for every server → client event. */
  emit<T>(event: WebSocketEventName, data: T, requestId?: string): void {
    if (!this.server) return;
    const payload: WebSocketEvent<T> = {
      event,
      data,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };
    this.server.emit(event, payload);
  }
}
