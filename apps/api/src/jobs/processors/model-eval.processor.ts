import { Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import type { Timeframe, TrainRequest } from '@ts/types';
import { JsonLogger } from '../../common/logger/json-logger';
import { AiEngineClient } from '../../modules/technical-analysis/ai-engine.client';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';

export interface ModelEvalJobData {
  reason?: string;
  horizon?: string;
  threshold?: number;
  seed?: number;
  featureVersion?: string;
  symbols?: string[];
  timeframes?: Timeframe[];
  trainStart?: string;
  validationStart?: string;
  testStart?: string;
  end?: string;
  calibrationMethod?: 'platt' | 'isotonic';
  walkForward?: boolean;
  writeReport?: boolean;
}

/** Real `model-eval` worker: walks forward, calibrates and registers models. */
@Injectable()
export class ModelEvalProcessor extends IdempotentProcessor<ModelEvalJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly ai: AiEngineClient,
  ) {
    super(logger, redis);
  }

  protected async handle(data: ModelEvalJobData): Promise<void> {
    const request: TrainRequest = {
      horizon: data.horizon ?? '24h',
      threshold: data.threshold ?? env.PREDICTION_THRESHOLD,
      seed: data.seed ?? 42,
      featureVersion: data.featureVersion ?? env.FEATURE_VERSION,
      calibrationMethod: data.calibrationMethod ?? 'platt',
      walkForward: data.walkForward ?? env.WALK_FORWARD_ENABLED,
      writeReport: data.writeReport ?? false,
      ...(data.symbols === undefined ? {} : { symbols: data.symbols }),
      ...(data.timeframes === undefined ? {} : { timeframes: data.timeframes }),
      ...(data.trainStart === undefined ? {} : { trainStart: data.trainStart }),
      ...(data.validationStart === undefined ? {} : { validationStart: data.validationStart }),
      ...(data.testStart === undefined ? {} : { testStart: data.testStart }),
      ...(data.end === undefined ? {} : { end: data.end }),
    };
    const result = await this.ai.train(request);
    this.logger.log('model evaluation complete', 'WORKER', {
      reason: data.reason ?? 'cron',
      datasetVersion: result.datasetVersion,
      selectedModel: result.selectedModel,
      selectedVersion: result.selectedVersion,
      xgboostGatePassed: result.xgboostGatePassed,
      modelRuns: result.modelRuns,
    });
  }
}
