import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../../common/logger/json-logger';
import { QuoteService } from '../../modules/market/quote.service';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';

export interface MarketSyncJobData {
  /** Empty means every active pair; a subset is useful for manual retries. */
  symbols?: string[];
}

/** Idempotent per-pair fan-out driven by the market-sync cron queue. */
@Injectable()
export class MarketSyncProcessor extends IdempotentProcessor<MarketSyncJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly quotes: QuoteService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: MarketSyncJobData): Promise<void> {
    const result = await this.quotes.syncAll(data.symbols);
    this.logger.log('market quote sync complete', 'WORKER', {
      updated: result.updated.length,
      failed: result.failed.length,
      symbols: result.failed,
    });
  }
}
