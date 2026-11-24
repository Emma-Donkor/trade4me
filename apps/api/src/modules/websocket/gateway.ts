import { createAdapter } from '@socket.io/redis-adapter';
import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
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
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
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
export class EventsGateway implements OnModuleInit, OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server | undefined;

  private pubSubReady = false;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Optional() private readonly strategy?: JwtStrategy,
  ) {}

  /** Redis clients are lazy; connect them before Socket.IO calls `psubscribe`. */
  async onModuleInit(): Promise<void> {
    try {
      await this.redis.ensureConnected();
      this.pubSubReady = true;
    } catch (error) {
      this.pubSubReady = false;
      this.logger.warn(
        `Redis pub/sub unavailable; realtime runs without the shared adapter: ${String(error)}`,
        'WS',
      );
    }
  }

  afterInit(server: Server): void {
    this.server = server;
    if (!this.pubSubReady) return;
    // Nest hands the gateway a Namespace (because `/` is configured), not the
    // root Server. `Namespace.adapter` is the live adapter instance, so it must
    // never be overwritten with a factory; install it on `Namespace.server`
    // instead. Socket.IO v4's `Server.adapter()` rebinds every namespace.
    const io = (server as unknown as { server?: Server }).server ?? server;
    io.adapter(createAdapter(this.redis.getPublisher(), this.redis.getSubscriber()) as never);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = handshakeToken(client);
    const secret = env.JWT_SECRET ? String(env.JWT_SECRET) : '';

    if (!token) {
      this.logger.warn('WS handshake rejected: no token supplied', 'WS');
      client.disconnect(true);
      return;
    }
    if (!secret) {
      this.logger.warn('WS handshake rejected: JWT secret not configured', 'WS');
      client.disconnect(true);
      return;
    }
    try {
      // P06: the same verification path as HTTP, including revocation checks.
      client.data.user = this.strategy
        ? await this.strategy.authenticate(token)
        : verify(token, secret);
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
