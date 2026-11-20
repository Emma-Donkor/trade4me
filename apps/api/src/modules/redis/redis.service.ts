import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { configuration } from '../../config/configuration';
import { dependencyError, type DependencyStatus } from '../health/dependency-status';

function redisOptions() {
  return {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    lazyConnect: true,
  } as const;
}

/** Shared ioredis clients: commands, BullMQ pub/sub and Socket.IO adapter. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(configuration.redis.url, redisOptions());
  private readonly publisher = new Redis(configuration.redis.url, redisOptions());
  private readonly subscriber = new Redis(configuration.redis.url, redisOptions());

  getClient(): Redis {
    return this.client;
  }

  getPublisher(): Redis {
    return this.publisher;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  async ensureConnected(): Promise<void> {
    for (const client of [this.client, this.publisher, this.subscriber]) {
      if (client.status === 'ready' || client.status === 'connecting') continue;
      await client.connect();
    }
  }

  private async reconnect(client: Redis): Promise<void> {
    client.disconnect();
    if (client.status !== 'end') {
      await new Promise<void>((resolve) => client.once('end', () => resolve()));
    }
    await client.connect();
  }

  async ping(): Promise<DependencyStatus> {
    const startedAt = Date.now();
    const result = (reply: unknown): DependencyStatus => {
      if (reply !== 'PONG') {
        return {
          status: 'down',
          latencyMs: Date.now() - startedAt,
          error: `Unexpected Redis reply: ${String(reply)}`,
        };
      }
      return { status: 'up', latencyMs: Date.now() - startedAt, error: null };
    };

    try {
      await this.ensureConnected();
      return result(await this.client.ping());
    } catch (error) {
      try {
        await this.reconnect(this.client);
        return result(await this.client.ping());
      } catch (retryError) {
        return {
          status: 'down',
          latencyMs: Date.now() - startedAt,
          error: dependencyError(retryError ?? error),
        };
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [this.client, this.publisher, this.subscriber]
        .filter((client) => client.status !== 'end')
        .map((client) => client.quit().catch(() => undefined)),
    );
  }
}
