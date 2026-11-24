import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Injectable, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { RedisOptions } from 'ioredis';
import type { Queue } from 'bullmq';
import { env } from '@ts/config';
import { configuration } from '../config/configuration';

export const QUEUE_NAMES = [
  'market-sync',
  'backfill',
  'integrity',
  'news-ingest',
  'features',
  'model-eval',
  'outcomes',
  'drift',
  'cleanup',
  'health',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** BullMQ needs unlimited retries per request and a parsed connection URL. */
export function bullConnectionOptions(): RedisOptions {
  const url = new URL(configuration.redis.url);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  };
}

export function queueToken(name: QueueName): string {
  return getQueueToken(name);
}

/** Central lookup so no module hard-codes an injected queue token. */
@Injectable()
export class QueueRegistry {
  constructor(private readonly moduleRef: ModuleRef) {}

  get(name: QueueName): Queue {
    return this.moduleRef.get<Queue>(queueToken(name), { strict: false });
  }

  all(): Queue[] {
    return QUEUE_NAMES.map((name) => this.get(name));
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.all().map((queue) => queue.close()));
  }
}

@Module({
  imports: [
    BullModule.forRoot({
      connection: bullConnectionOptions(),
      prefix: `${String(env.REDIS_PREFIX ?? 'tradesense:')}bull`,
    }),
    BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
  ],
  providers: [QueueRegistry],
  exports: [BullModule, QueueRegistry],
})
export class QueuesModule {}
