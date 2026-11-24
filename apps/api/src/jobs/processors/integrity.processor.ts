import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../../common/logger/json-logger';
import { CandleIntegrityService } from '../../modules/market/integrity.service';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';
import { QueueRegistry } from '../queues';

/** Daily gap scan; every hole becomes one deduplicated provider-only repair job. */
@Injectable()
export class IntegrityProcessor extends IdempotentProcessor<Record<string, unknown>> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly integrity: CandleIntegrityService,
    private readonly queues: QueueRegistry,
  ) {
    super(logger, redis);
  }

  protected async handle(): Promise<void> {
    const result = await this.integrity.scanAll();
    for (const gap of result.gaps) {
      await this.queues.get('backfill').add(
        'repair-gap',
        {
          symbol: gap.symbol,
          timeframe: gap.timeframe,
          from: gap.from,
          to: gap.to,
        },
        {
          jobId: `history-repair:${gap.symbol}:${gap.timeframe}:${gap.from}:${gap.to}`,
        },
      );
    }
    this.logger.log('history integrity scan complete', 'WORKER', {
      scanned: result.scanned,
      gaps: result.gaps.length,
      enqueued: result.gaps.length,
    });
  }
}
