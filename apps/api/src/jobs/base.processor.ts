import type { Job } from 'bullmq';
import { JsonLogger } from '../common/logger/json-logger';
import { RedisService } from '../modules/redis/redis.service';

/**
 * Base for future processors: idempotency lock, retry metadata and audit log
 * are handled once, so feature modules only implement `handle`.
 */
export abstract class IdempotentProcessor<T = Record<string, unknown>> {
  private static readonly LOCK_TTL_SECONDS = 60 * 60;

  constructor(
    protected readonly logger: JsonLogger,
    protected readonly redis: RedisService,
  ) {}

  async process(job: Job<T>): Promise<void> {
    const lockKey = `${String(job.queueName)}:lock:${String(job.name)}:${String(job.id ?? 'unknown')}`;
    const acquired = await this.redis
      .getClient()
      .set(lockKey, '1', 'EX', IdempotentProcessor.LOCK_TTL_SECONDS, 'NX');

    if (acquired !== 'OK') {
      this.logger.log('duplicate job skipped', 'JOBS', { jobId: job.id, queue: job.queueName });
      return;
    }

    try {
      await this.handle(job.data, job);
    } finally {
      await this.redis.getClient().del(lockKey);
    }
  }

  protected abstract handle(data: T, job: Job<T>): Promise<void>;
}

/** Placeholder used until each worker gets its real processor in later phases. */
export class ScaffoldProcessor extends IdempotentProcessor<Record<string, unknown>> {
  protected async handle(data: Record<string, unknown>, job: Job<Record<string, unknown>>) {
    this.logger.log('job accepted; processor arrives in a later phase', 'JOBS', {
      queue: job.queueName,
      jobName: job.name,
      jobId: job.id,
      keys: Object.keys(data),
    });
  }
}
