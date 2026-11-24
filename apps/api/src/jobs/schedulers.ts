import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { env } from '@ts/config';
import { JsonLogger } from '../common/logger/json-logger';
import { BackfillProcessor } from './processors/backfill.processor';
import { IntegrityProcessor } from './processors/integrity.processor';
import { MarketSyncProcessor } from './processors/market-sync.processor';
import { bullConnectionOptions, QUEUE_NAMES, QueueRegistry, type QueueName } from './queues';

export interface CronRegistration {
  queue: QueueName;
  name: string;
  pattern: string;
}

/** Inline comments in `.env.example` are stripped before BullMQ parses a cron. */
export function cronPattern(value: unknown, fallback: string): string {
  const pattern = String(value ?? '')
    .split('#')[0]
    .trim();
  return pattern.length > 0 ? pattern : fallback;
}

export const CRON_REGISTRATIONS: CronRegistration[] = [
  {
    queue: 'market-sync',
    name: 'market-sync-hourly',
    pattern: cronPattern(env.MARKET_SYNC_CRON, '0 * * * *'),
  },
  {
    queue: 'integrity',
    name: 'history-integrity-daily',
    pattern: cronPattern(env.MARKET_INTEGRITY_CRON, '0 4 * * *'),
  },
  {
    queue: 'news-ingest',
    name: 'news-ingest-quarter-hourly',
    pattern: cronPattern(env.NEWS_INGEST_CRON, '*/15 * * * *'),
  },
  {
    queue: 'features',
    name: 'feature-regeneration',
    pattern: cronPattern(env.FEATURE_JOB_CRON, '*/30 * * * *'),
  },
  {
    queue: 'outcomes',
    name: 'prediction-outcomes',
    pattern: cronPattern(env.OUTCOME_JOB_CRON, '0 * * * *'),
  },
  {
    queue: 'cleanup',
    name: 'cleanup-daily',
    pattern: cronPattern(env.CLEANUP_CRON, '0 3 * * *'),
  },
  {
    queue: 'health',
    name: 'health-every-minute',
    pattern: '* * * * *',
  },
];

@Injectable()
export class SchedulerService implements OnModuleInit {
  constructor(
    private readonly queues: QueueRegistry,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const registration of CRON_REGISTRATIONS) {
      try {
        await this.queues.get(registration.queue).upsertJobScheduler(
          registration.name,
          { pattern: registration.pattern },
          {
            name: registration.name,
            data: {},
            opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
          },
        );
        this.logger.log('cron registered', 'SCHEDULER', {
          queue: registration.queue,
          name: registration.name,
          pattern: registration.pattern,
        });
      } catch (error) {
        this.logger.warn(
          `cron registration failed for ${registration.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'SCHEDULER',
        );
      }
    }
  }
}

/** One worker per queue; P08/P09 queues run their real processors. */
@Injectable()
export class JobWorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Optional() private readonly marketSyncProcessor?: MarketSyncProcessor,
    @Optional() private readonly backfillProcessor?: BackfillProcessor,
    @Optional() private readonly integrityProcessor?: IntegrityProcessor,
  ) {}

  onModuleInit(): void {
    this.start();
  }

  start(): void {
    if (this.workers.length > 0) return;
    for (const queueName of QUEUE_NAMES) {
      const worker = new Worker(
        queueName,
        async (job) => {
          if (queueName === 'market-sync' && this.marketSyncProcessor) {
            await this.marketSyncProcessor.process(job);
            return;
          }
          if (queueName === 'backfill' && this.backfillProcessor) {
            await this.backfillProcessor.process(job);
            return;
          }
          if (queueName === 'integrity' && this.integrityProcessor) {
            await this.integrityProcessor.process(job);
            return;
          }
          this.logger.log('job received; processor arrives in a later phase', 'WORKER', {
            queue: queueName,
            jobName: job.name,
            jobId: job.id,
          });
        },
        // BullModule.forRoot prefixes queue keys; raw workers must match it.
        {
          connection: bullConnectionOptions(),
          prefix: `${String(env.REDIS_PREFIX ?? 'tradesense:')}bull`,
        },
      );
      worker.on('failed', (job, error) => {
        this.logger.error(
          error instanceof Error ? error.message : String(error),
          undefined,
          'WORKER',
        );
        this.logger.warn(`job ${String(job?.id)} failed`, 'WORKER');
      });
      this.workers.push(worker);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers.length = 0;
  }
}
