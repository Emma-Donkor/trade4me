import { Injectable } from '@nestjs/common';
import type { Timeframe } from '@ts/types';
import { BackfillService } from '../../modules/market/backfill.service';
import { JsonLogger } from '../../common/logger/json-logger';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';

export interface BackfillJobData {
  symbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  resume?: boolean;
}

/** Executes deep-history imports and gap repair requests from the queue. */
@Injectable()
export class BackfillProcessor extends IdempotentProcessor<BackfillJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly backfill: BackfillService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: BackfillJobData): Promise<void> {
    const result = await this.backfill.run({
      symbol: data.symbol,
      timeframe: data.timeframe,
      from: new Date(data.from),
      to: new Date(data.to),
      resume: data.resume,
    });
    this.logger.log('history backfill job complete', 'WORKER', {
      symbol: result.symbol,
      timeframe: result.timeframe,
      written: result.written,
      gaps: result.gaps.length,
    });
  }
}
