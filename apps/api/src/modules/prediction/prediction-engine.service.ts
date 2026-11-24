import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PREDICTION_HORIZON_MINUTES,
  DRIFT_SIGNAL_WEIGHT,
  PREDICTION_CACHE_TTL_SECONDS,
} from '@ts/config';
import { Prisma, type ModelStatus } from '@ts/database';
import type {
  CombinedAssessmentView,
  FeatureVector,
  ModelSignalPolicy,
  PredictResponse,
  Timeframe,
} from '@ts/types';
import { predictResponseSchema, type SymbolParam } from '@ts/validation';
import { RedisService } from '../redis/redis.service';
import { FeatureService } from '../market/feature.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiEngineClient } from '../technical-analysis/ai-engine.client';

/** P14 — the policy attached to every prediction-consuming view. */
export interface PredictionEvaluation {
  prediction: PredictResponse | null;
  modelStatus: ModelStatus;
  signalPolicy: ModelSignalPolicy;
  persistedId?: string;
}

/**
 * P14 — the API's audit and cache boundary around Python inference.
 *
 * Python remains the only math authority. This service adds the registry
 * lookup, exact feature snapshot, short version-keyed cache and the signal
 * policy that P16 consumes; it never recomputes a probability itself.
 */
@Injectable()
export class PredictionEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly features: FeatureService,
    private readonly ai: AiEngineClient,
  ) {}

  /** Human-readable policy; a degraded model is never silently trusted. */
  static policy(status: ModelStatus): ModelSignalPolicy {
    if (status === 'ACTIVE') return { weight: 1, block: false, reason: null };
    if (status === 'DRIFT_WARNING') {
      return {
        weight: DRIFT_SIGNAL_WEIGHT,
        block: false,
        reason: 'MODEL PERFORMANCE WARNING: drifting model is down-weighted',
      };
    }
    return { weight: 0, block: true, reason: `model status ${status} blocks signals` };
  }

  /** Evaluate one symbol; absence of a promoted model is an honest null. */
  async evaluate(
    symbol: SymbolParam,
    timeframe: Timeframe = 'H1',
    horizon: number = DEFAULT_PREDICTION_HORIZON_MINUTES,
  ): Promise<PredictionEvaluation> {
    const active = await this.prisma.getClient().modelVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, version: true, status: true },
    });
    if (active === null) {
      return {
        prediction: null,
        modelStatus: 'TRAINING',
        signalPolicy: PredictionEngineService.policy('TRAINING'),
      };
    }

    const cacheKey = this.redis.key(
      'prediction',
      symbol.symbol,
      active.id,
      timeframe,
      String(horizon),
    );
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      try {
        return {
          prediction: predictResponseSchema.parse(JSON.parse(cached)),
          modelStatus: active.status,
          signalPolicy: PredictionEngineService.policy(active.status),
        };
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const vector = await this.features.latest(symbol.symbol, timeframe);
    const prediction = await this.ai.predict({
      symbol: symbol.symbol,
      timeframe,
      horizon,
      featureVersion: vector.featureVersion,
      asOf: vector.timestamp,
      features: vector.features,
    });

    const persistedId = await this.persist(
      symbol.symbol,
      timeframe,
      horizon,
      active,
      vector,
      prediction,
    );
    await this.redis.set(cacheKey, JSON.stringify(prediction), PREDICTION_CACHE_TTL_SECONDS);
    return {
      prediction,
      modelStatus: active.status,
      signalPolicy: PredictionEngineService.policy(active.status),
      ...(persistedId === undefined ? {} : { persistedId }),
    };
  }

  /** Attach the snapshot to the assessment view consumed by P16/P20. */
  async assessmentFields(
    symbol: SymbolParam,
    timeframe: Timeframe,
  ): Promise<Pick<CombinedAssessmentView, 'prediction' | 'modelStatus' | 'signalPolicy'>> {
    const result = await this.evaluate(symbol, timeframe);
    return {
      prediction: result.prediction,
      modelStatus: result.modelStatus,
      signalPolicy: result.signalPolicy,
    };
  }

  private async persist(
    symbol: string,
    timeframe: Timeframe,
    horizon: number,
    active: { id: string; name: string; version: string },
    vector: FeatureVector,
    prediction: PredictResponse,
  ): Promise<string | undefined> {
    const client = this.prisma.getClient();
    const [pair, run] = await Promise.all([
      client.currencyPair.findUnique({ where: { symbol }, select: { id: true } }),
      client.modelRun.findFirst({
        where: { modelVersionId: active.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
    ]);
    if (pair === null || run === null) return undefined;

    const row = await client.prediction.create({
      data: {
        pairId: pair.id,
        timeframe,
        horizon,
        modelVersionId: active.id,
        modelRunId: run.id,
        direction: prediction.direction,
        probability: prediction.probability,
        confidence: prediction.confidence,
        riskLevel: prediction.riskLevel,
        // Exact inputs: without them the prediction cannot be audited or replayed.
        featuresSnapshot: {
          symbol,
          timeframe,
          horizon,
          modelVersion: `${active.name}-${active.version}`,
          featureVersion: vector.featureVersion,
          asOf: vector.timestamp,
          features: vector.features,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
  }
}
