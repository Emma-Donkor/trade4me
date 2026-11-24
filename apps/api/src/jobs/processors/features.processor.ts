import { Injectable } from '@nestjs/common';
import type { Timeframe } from '@ts/types';
import { JsonLogger } from '../../common/logger/json-logger';
import { FeatureService } from '../../modules/market/feature.service';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';

export interface FeaturesJobData {
  reason?: string;
  symbols?: string[];
  timeframes?: Timeframe[];
  asOf?: string;
}

/** Real `features` worker: rolling vectors are upserted with a version key. */
@Injectable()
export class FeaturesProcessor extends IdempotentProcessor<FeaturesJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly features: FeatureService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: FeaturesJobData): Promise<void> {
    const result = await this.features.regenerate({
      symbols: data.symbols,
      timeframes: data.timeframes,
      asOf: data.asOf,
    });
    this.logger.log('feature regeneration complete', 'WORKER', {
      reason: data.reason ?? 'cron',
      featureVersion: result.featureVersion,
      pairs: result.pairs,
      timeframes: result.timeframes,
      batches: result.batches,
      vectors: result.vectors,
      skipped: result.skipped,
    });
  }
}
