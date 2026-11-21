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

  /** Namespaced key used by auth sessions, refresh rotation and rate limits. */
  key(...parts: string[]): string {
    return `${configuration.redis.prefix}${parts.join(':')}`;
  }

  /** P06: small command surface shared by auth services. All keys are prefixed. */
  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.ensureConnected();
    if (ttlSeconds === undefined) {
      await this.client.set(this.key(key), value);
      return;
    }
    await this.client.set(this.key(key), value, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    await this.ensureConnected();
    return this.client.del(...keys.map((key) => this.key(key)));
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    return (await this.client.exists(this.key(key))) === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.ensureConnected();
    await this.client.expire(this.key(key), Math.max(1, Math.ceil(ttlSeconds)));
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnected();
    return this.client.ttl(this.key(key));
  }

  /** Atomic increment that only sets the expiry when creating the key. */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    await this.ensureConnected();
    const namespaced = this.key(key);
    const count = await this.client.incr(namespaced);
    if (count === 1) await this.client.expire(namespaced, Math.max(1, Math.ceil(ttlSeconds)));
    return count;
  }

  async addToSet(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) return;
    await this.ensureConnected();
    await this.client.sadd(this.key(key), ...members);
  }

  async removeFromSet(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) return;
    await this.ensureConnected();
    await this.client.srem(this.key(key), ...members);
  }

  async membersOfSet(key: string): Promise<string[]> {
    await this.ensureConnected();
    return this.client.smembers(this.key(key));
  }

  async deleteSet(key: string): Promise<void> {
    await this.del(key);
  }

  /** Iterate keys with SCAN so session listings never block a shared Redis. */
  async scanKeys(pattern: string): Promise<string[]> {
    await this.ensureConnected();
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', this.key(pattern), 'COUNT', 100);
      cursor = next;
      found.push(...keys.map((key) => key.slice(configuration.redis.prefix.length)));
    } while (cursor !== '0');
    return found;
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
