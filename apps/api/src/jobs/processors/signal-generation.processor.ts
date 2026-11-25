import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../../common/logger/json-logger';
import { RedisService } from '../../modules/redis/redis.service';
import { SignalGenerationService } from '../../modules/signals/signal-generation.service';
import { IdempotentProcessor } from '../base.processor';

export interface SignalGenerationJobData {
  reason?: string;
  symbols?: string[];
  asOf?: string;
}

/** Real `signals` worker: runs after feature/prediction refreshes. */
@Injectable()
export class SignalGenerationProcessor extends IdempotentProcessor<SignalGenerationJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly generation: SignalGenerationService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: SignalGenerationJobData): Promise<void> {
    const asOf = data.asOf === undefined ? new Date() : new Date(data.asOf);
    const signals = await this.generation.generateAll(
      data.symbols,
      Number.isNaN(asOf.getTime()) ? new Date() : asOf,
    );
    this.logger.log('signal generation complete', 'WORKER', {
      reason: data.reason ?? 'cron',
      signals: signals.length,
      noTrade: signals.filter((signal) => signal.action === 'NO_TRADE').length,
    });
  }
}
