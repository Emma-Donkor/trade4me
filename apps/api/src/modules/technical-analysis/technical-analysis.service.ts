import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ContextualPatternDetection,
  MarketRegime,
  RegimeAnalysisView,
  RegimeSnapshot,
  TechnicalAnalysisView,
  TechnicalIndicatorValue,
  Timeframe,
} from '@ts/types';
import type { SymbolParam } from '@ts/validation';
import { timeframeSchema, z } from '@ts/validation';
import { insufficientData } from '../../common/errors/stub-errors';
import { CandleService } from '../market/candles.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsService } from '../websocket/events.service';
import { AiEngineClient } from './ai-engine.client';
import { ScoreService } from './score.service';

export interface TechnicalQuery {
  timeframe?: Timeframe;
  indicators?: string[];
}

export const MAX_TA_CANDLES = 500;
export const TA_TTL_SECONDS = 60;
export const INDICATOR_VERSION = 'p10.1';
export const REGIME_FEATURE_VERSION = 'regime-v1';

const DEFAULT_TIMEFRAME: Timeframe = 'H1';
const MIN_TA_CANDLES = 50;

const REGIME_VALUES = [
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RANGE',
  'WEAK_DOWNTREND',
  'STRONG_DOWNTREND',
  'HIGH_VOLATILITY',
  'LOW_VOLATILITY',
  'UNCERTAIN',
] as const;

const regimeSchema = z.object({
  regime: z.enum(REGIME_VALUES),
  confidence: z.number(),
  evidence: z.record(z.string(), z.unknown()),
});
const patternSchema = z
  .object({ pattern: z.string(), score: z.number(), detectedAt: z.string() })
  .passthrough();
const cachedTechnicalSchema = z
  .object({
    symbol: z.string(),
    timeframe: z.string(),
    asOf: z.string(),
    source: z.enum(['ai', 'cache']),
    indicators: z.record(z.string(), z.unknown()),
    patterns: z.array(patternSchema),
    regime: regimeSchema,
    score: z.object({ score: z.number() }).passthrough(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
const cachedRegimeSchema = z.object({
  symbol: z.string(),
  timeframe: timeframeSchema,
  asOf: z.string(),
  source: z.enum(['ai', 'cache']),
  regime: z.enum(REGIME_VALUES),
  confidence: z.number(),
  evidence: z.record(z.string(), z.unknown()),
});

export function technicalCacheKey(
  symbol: string,
  timeframe: Timeframe,
  indicators: string[] | undefined,
  timestamps: readonly string[],
): string {
  const fingerprint = createHash('sha1')
    .update(JSON.stringify([indicators ?? null, timestamps]))
    .digest('base64url')
    .slice(0, 16);
  return `ta:${symbol}:${timeframe}:${fingerprint}`;
}

export function regimeCacheKey(symbol: string, timeframe: Timeframe): string {
  return `ta:regime:${symbol}:${timeframe}`;
}

export function lastRegimeKey(symbol: string, timeframe: Timeframe): string {
  return `ta:regime:last:${symbol}:${timeframe}`;
}

export abstract class TechnicalAnalysisService {
  abstract technical(symbol: SymbolParam, query?: TechnicalQuery): Promise<TechnicalAnalysisView>;

  abstract regime(symbol: SymbolParam): Promise<RegimeAnalysisView>;
}

/** P10 — orchestration, persistence, cache and WS emission around the Python engine. */
@Injectable()
export class TechnicalAnalysisServiceImpl extends TechnicalAnalysisService {
  constructor(
    private readonly candles: CandleService,
    private readonly ai: AiEngineClient,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventsService,
    private readonly scores: ScoreService,
  ) {
    super();
  }

  async technical(symbol: SymbolParam, query: TechnicalQuery = {}): Promise<TechnicalAnalysisView> {
    const timeframe = query.timeframe ?? DEFAULT_TIMEFRAME;
    const indicators = query.indicators?.map((name) => name.toUpperCase());
    const candles = await this.loadCandles(symbol.symbol, timeframe);
    if (candles.length < MIN_TA_CANDLES) {
      insufficientData('technical candles', { symbol: symbol.symbol, timeframe });
    }

    const key = technicalCacheKey(
      symbol.symbol,
      timeframe,
      indicators,
      candles.map((candle) => candle.timestamp),
    );
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        const parsed = cachedTechnicalSchema.parse(JSON.parse(cached) as unknown);
        return { ...parsed, source: 'cache' } as unknown as TechnicalAnalysisView;
      } catch {
        await this.redis.del(key);
      }
    }

    const response = await this.ai.indicators({
      symbol: symbol.symbol,
      timeframe,
      ...(indicators ? { indicators } : {}),
      candles: candles.map((candle) => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        ...(candle.volume === null ? {} : { volume: candle.volume }),
      })),
    });

    const view = this.toView(response, timeframe, indicators, 'ai');
    const regimeView = this.toRegimeView(view);
    await this.persist(symbol.symbol, timeframe, candles[candles.length - 1], view);
    await this.emitRegimeChangeIfNeeded(symbol.symbol, timeframe, regimeView);
    await this.redis.set(key, JSON.stringify(view), TA_TTL_SECONDS);
    await this.redis.set(
      regimeCacheKey(symbol.symbol, timeframe),
      JSON.stringify(regimeView),
      TA_TTL_SECONDS,
    );
    return view;
  }

  async regime(symbol: SymbolParam): Promise<RegimeAnalysisView> {
    const cached = await this.redis.get(regimeCacheKey(symbol.symbol, DEFAULT_TIMEFRAME));
    if (cached) {
      try {
        const parsed = cachedRegimeSchema.parse(JSON.parse(cached) as unknown);
        return { ...parsed, source: 'cache' };
      } catch {
        await this.redis.del(regimeCacheKey(symbol.symbol, DEFAULT_TIMEFRAME));
      }
    }
    const technical = await this.technical(symbol, { timeframe: DEFAULT_TIMEFRAME });
    return this.toRegimeView(technical);
  }

  private async loadCandles(symbol: string, timeframe: Timeframe) {
    return this.candles.latestSeries(symbol, timeframe, MAX_TA_CANDLES);
  }

  private toView(
    response: Awaited<ReturnType<AiEngineClient['indicators']>>,
    timeframe: Timeframe,
    indicators: string[] | undefined,
    source: 'ai' | 'cache',
  ): TechnicalAnalysisView {
    const reserved = new Set(['patterns', 'regime', 'score', 'metadata']);
    const values: Record<string, TechnicalIndicatorValue> = {};
    for (const [name, value] of Object.entries(response.indicators)) {
      if (!reserved.has(name)) values[name] = value as TechnicalIndicatorValue;
    }
    const patterns = Array.isArray(response.indicators.patterns)
      ? (response.indicators.patterns as unknown as ContextualPatternDetection[])
      : [];
    const parsedRegime = regimeSchema.safeParse(response.indicators.regime);
    const regime: RegimeSnapshot = parsedRegime.success
      ? parsedRegime.data
      : { regime: 'UNCERTAIN', confidence: 0, evidence: { reason: 'missing_engine_regime' } };
    const engineMetadata =
      typeof response.indicators.metadata === 'object' && response.indicators.metadata !== null
        ? (response.indicators.metadata as Record<string, unknown>)
        : {};
    return {
      symbol: response.symbol,
      timeframe: (response.timeframe as Timeframe) ?? timeframe,
      asOf: response.computedAt,
      source,
      indicators: values,
      patterns,
      regime,
      score: this.scores.normalise(response.indicators.score),
      metadata: {
        indicatorVersion: INDICATOR_VERSION,
        ...engineMetadata,
        ...(indicators ? { requested: indicators } : {}),
      },
    };
  }

  private toRegimeView(view: TechnicalAnalysisView): RegimeAnalysisView {
    return {
      symbol: view.symbol,
      timeframe: view.timeframe,
      asOf: view.asOf,
      source: view.source,
      regime: view.regime.regime,
      confidence: view.regime.confidence,
      evidence: view.regime.evidence,
    };
  }

  private async persist(
    symbol: string,
    timeframe: Timeframe,
    latest: { timestamp: string },
    view: TechnicalAnalysisView,
  ): Promise<void> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (!pair) return; // CandleService already rejects unknown symbols.

    const timestamp = new Date(latest.timestamp);
    const computedAt = new Date(view.asOf);
    const safeComputedAt = Number.isNaN(computedAt.getTime()) ? new Date() : computedAt;
    const client = this.prisma.getClient();
    await Promise.all([
      ...Object.entries(view.indicators).map(([name, value]) =>
        client.technicalIndicator.upsert({
          where: {
            indicator_pair_timeframe_name_timestamp_key: {
              pairId: pair.id,
              timeframe,
              name,
              timestamp,
            },
          },
          create: {
            pairId: pair.id,
            timeframe,
            name,
            timestamp,
            value: value as object,
            computedAt: safeComputedAt,
          },
          update: { value: value as object, computedAt: safeComputedAt },
        }),
      ),
      client.marketFeature.upsert({
        where: {
          feature_pair_timeframe_timestamp_version_key: {
            pairId: pair.id,
            timeframe,
            timestamp,
            featureVersion: REGIME_FEATURE_VERSION,
          },
        },
        create: {
          pairId: pair.id,
          timeframe,
          timestamp,
          featureVersion: REGIME_FEATURE_VERSION,
          values: view.regime as object,
          label: { regime: view.regime.regime },
        },
        update: {
          values: view.regime as object,
          label: { regime: view.regime.regime },
        },
      }),
    ]);
  }

  private async emitRegimeChangeIfNeeded(
    symbol: string,
    timeframe: Timeframe,
    regime: RegimeAnalysisView,
  ): Promise<void> {
    const key = lastRegimeKey(symbol, timeframe);
    const previous = await this.redis.get(key);
    if (previous && previous !== regime.regime) {
      this.events.regimeChanged({ symbol, regime: regime.regime as MarketRegime });
    }
    await this.redis.set(key, regime.regime);
  }
}

/** Backwards-compatible name used by earlier module wiring/tests. */
export { TechnicalAnalysisServiceImpl as Phase7TechnicalAnalysisService };
