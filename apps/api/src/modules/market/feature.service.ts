import { Injectable } from '@nestjs/common';
import { FEATURE_NAMES, env } from '@ts/config';
import { NewsImpact, type Prisma } from '@ts/database';
import type {
  CandleView,
  FeatureEventInput,
  FeatureInputCandle,
  FeatureNewsInput,
  FeatureVector,
  FeaturesResponse,
  SimilarHistoricalWindow,
  Timeframe,
} from '@ts/types';
import { insufficientData } from '../../common/errors/stub-errors';
import { AiEngineClient } from '../technical-analysis/ai-engine.client';
import { PrismaService } from '../prisma/prisma.service';
import { CandleService } from './candles.service';
import { HISTORY_TIMEFRAMES } from './timeframes';

/** Python's bounded builder is mirrored here so every API batch stays valid. */
export const MAX_FEATURE_BARS = 500;
export const MAX_FEATURE_VECTORS = 500;
export const MIN_FEATURE_HISTORY = 200;
export const MAX_FEATURE_READ_ROWS = 5_000;
const NEWS_LOOKBACK_MS = 72 * 3_600_000;

type FeatureRow = {
  timestamp: Date;
  values: Record<string, number>;
};

export interface RegenerateOptions {
  symbols?: readonly string[];
  timeframes?: readonly Timeframe[];
  asOf?: Date | string;
}

export interface RegenerateResult {
  featureVersion: string;
  pairs: number;
  timeframes: number;
  batches: number;
  vectors: number;
  skipped: string[];
}

function toInputCandle(candle: CandleView): FeatureInputCandle {
  return {
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    ...(candle.volume === null ? {} : { volume: candle.volume }),
  };
}

function assertVectorValues(value: unknown, context: string): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    insufficientData('feature vector', { context, reason: 'values is not an object' });
  }
  const features: Record<string, number> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      insufficientData('feature vector', { context, feature: name, reason: 'value is not finite' });
    }
    features[name] = raw;
  }
  const present = new Set(Object.keys(features));
  const missing = FEATURE_NAMES.filter((name) => !present.has(name));
  const extra = Object.keys(features).filter((name) => !FEATURE_NAMES.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    insufficientData('feature vector', {
      context,
      featureVersion: env.FEATURE_VERSION,
      missing,
      extra,
    });
  }
  return features;
}

/**
 * P12 — API-owned persistence around the Python feature authority.
 *
 * Python computes every value; this service fetches bounded inputs, invokes
 * `POST /features`, validates the manifest shape, and upserts versioned rows.
 */
@Injectable()
export class FeatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candles: CandleService,
    private readonly ai: AiEngineClient,
  ) {}

  /** Highest versioned vector at or before `at`, for prediction and scoring. */
  async latest(
    symbol: string,
    timeframe: Timeframe,
    at: Date | string | number = new Date(),
  ): Promise<FeatureVector> {
    const pair = await this.pairOf(symbol);
    const timestamp = at instanceof Date ? at : new Date(at);
    if (Number.isNaN(timestamp.getTime())) {
      insufficientData('feature vector', { symbol, timeframe, at: String(at) });
    }
    const row = await this.prisma.getClient().marketFeature.findFirst({
      where: {
        pairId: pair.id,
        timeframe,
        featureVersion: env.FEATURE_VERSION,
        timestamp: { lte: timestamp },
      },
      orderBy: { timestamp: 'desc' },
    });
    if (row === null) {
      insufficientData('feature vector', {
        symbol,
        timeframe,
        featureVersion: env.FEATURE_VERSION,
      });
    }
    return {
      symbol,
      timeframe,
      timestamp: row.timestamp.toISOString(),
      featureVersion: row.featureVersion,
      features: assertVectorValues(row.values, `${symbol}:${timeframe}:${row.timestamp}`),
    };
  }

  /**
   * Live nearest-neighbour search over persisted, versioned feature space.
   * Candidate vectors are standardised per feature before Euclidean ranking.
   */
  async nearest(
    symbol: string,
    timeframe: Timeframe,
    asOf: Date,
    candles: readonly CandleView[],
    limit: number,
  ): Promise<SimilarHistoricalWindow[]> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (pair === null) return [];

    const rows = await this.prisma.getClient().marketFeature.findMany({
      where: {
        pairId: pair.id,
        timeframe,
        featureVersion: env.FEATURE_VERSION,
        timestamp: { lte: asOf },
      },
      orderBy: { timestamp: 'asc' },
      take: MAX_FEATURE_READ_ROWS,
    });
    if (rows.length < 2) return [];

    const parsed: FeatureRow[] = rows.map((row) => ({
      timestamp: row.timestamp,
      values: assertVectorValues(row.values, `${symbol}:${timeframe}:${row.timestamp}`),
    }));
    const target = parsed[parsed.length - 1];
    const candidates = parsed.slice(0, -1);
    const keys = Object.keys(target.values).sort();
    const usable = candidates.filter((row) =>
      keys.every((key) => Number.isFinite(row.values[key])),
    );
    if (usable.length === 0) return [];

    const stats = keys.map((key) => {
      const values = usable.map((row) => row.values[key]);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.length > 1
          ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
          : 0;
      return { key, mean, deviation: Math.sqrt(Math.max(0, variance)) };
    });
    const active = stats.filter((stat) => stat.deviation > 1e-12);

    const orderedCandles = [...candles].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );
    const candleIndex = new Map(
      orderedCandles.map((candle, index) => [Date.parse(candle.timestamp), index]),
    );

    return usable
      .map((row) => {
        const squared = active.reduce((sum, stat) => {
          const left = (target.values[stat.key] - stat.mean) / stat.deviation;
          const right = (row.values[stat.key] - stat.mean) / stat.deviation;
          return sum + (left - right) ** 2;
        }, 0);
        const index = candleIndex.get(row.timestamp.getTime());
        const candle = index === undefined ? undefined : orderedCandles[index];
        const previous = index === undefined || index === 0 ? undefined : orderedCandles[index - 1];
        return {
          timestamp: row.timestamp.toISOString(),
          distance: active.length > 0 ? Math.sqrt(squared / active.length) : 0,
          close: candle?.close ?? 0,
          changePct:
            candle !== undefined && previous !== undefined && previous.close > 0
              ? ((candle.close - previous.close) / previous.close) * 100
              : 0,
        };
      })
      .sort((a, b) => a.distance - b.distance || a.timestamp.localeCompare(b.timestamp))
      .slice(0, limit);
  }

  /** Recompute rolling vectors for all active pairs and history timeframes. */
  async regenerate(options: RegenerateOptions = {}): Promise<RegenerateResult> {
    const asOf = options.asOf === undefined ? new Date() : new Date(options.asOf);
    const featureVersion = env.FEATURE_VERSION;
    const pairWhere: Prisma.CurrencyPairWhereInput = { isActive: true };
    if (options.symbols !== undefined && options.symbols.length > 0) {
      pairWhere.symbol = { in: [...options.symbols] };
    }
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      where: pairWhere,
      select: { id: true, symbol: true },
      orderBy: { symbol: 'asc' },
    });
    const timeframes = options.timeframes ?? HISTORY_TIMEFRAMES;
    const skipped: string[] = [];

    const news = await this.loadNews(asOf);
    const events = await this.loadEvents(asOf);

    const series = new Map<string, Map<string, CandleView[]>>();
    for (const timeframe of timeframes) {
      const bySymbol = new Map<string, CandleView[]>();
      for (const pair of pairs) {
        const rows = await this.candles.series(
          pair.symbol,
          timeframe,
          new Date(0),
          asOf,
          MAX_FEATURE_READ_ROWS,
        );
        bySymbol.set(pair.symbol, rows);
      }
      series.set(timeframe, bySymbol);
    }

    let batches = 0;
    let vectors = 0;
    for (const timeframe of timeframes) {
      const bySymbol = series.get(timeframe) ?? new Map<string, CandleView[]>();
      for (const pair of pairs) {
        const rows = bySymbol.get(pair.symbol) ?? [];
        if (rows.length < MIN_FEATURE_HISTORY) {
          skipped.push(`${pair.symbol}:${timeframe}`);
          continue;
        }
        for (let end = MIN_FEATURE_HISTORY - 1; end < rows.length; end += MAX_FEATURE_VECTORS) {
          const ends: number[] = [];
          for (
            let cursor = end;
            cursor < Math.min(end + MAX_FEATURE_VECTORS, rows.length);
            cursor += 1
          ) {
            ends.push(cursor);
          }
          const last = ends[ends.length - 1];
          const startIndex = Math.max(0, last - (MAX_FEATURE_BARS - 1));
          const fromMs = Date.parse(rows[startIndex].timestamp);
          const toMs = Date.parse(rows[last].timestamp);
          const peerCandles: Record<string, FeatureInputCandle[]> = {};
          for (const [peerSymbol, peerRows] of bySymbol) {
            if (peerSymbol === pair.symbol) continue;
            peerCandles[peerSymbol] = peerRows
              .filter((candle) => {
                const time = Date.parse(candle.timestamp);
                return time >= fromMs && time <= toMs;
              })
              .slice(-MAX_FEATURE_BARS)
              .map(toInputCandle);
          }

          const response: FeaturesResponse = await this.ai.features({
            symbol: pair.symbol,
            timeframe,
            featureVersion,
            asOf: rows[last].timestamp,
            candles: rows.slice(startIndex, last + 1).map(toInputCandle),
            peerCandles,
            news,
            events,
            timestamps: ends.map((index) => rows[index].timestamp),
          });

          if (response.vectors.length !== ends.length) {
            insufficientData('feature vector batch', {
              symbol: pair.symbol,
              timeframe,
              expected: ends.length,
              received: response.vectors.length,
            });
          }
          for (let index = 0; index < ends.length; index += 1) {
            const vector = response.vectors[index];
            const expected = new Date(rows[ends[index]].timestamp).toISOString();
            if (vector.timestamp !== expected) {
              insufficientData('feature vector batch', {
                symbol: pair.symbol,
                timeframe,
                expected,
                received: vector.timestamp,
              });
            }
            assertVectorValues(vector.features, `${pair.symbol}:${timeframe}:${expected}`);
          }
          await this.upsertBatch(
            pair.id,
            timeframe,
            featureVersion,
            response,
            ends.map((index) => rows[index].timestamp),
          );
          batches += 1;
          vectors += ends.length;
        }
      }
    }

    return {
      featureVersion,
      pairs: pairs.length,
      timeframes: timeframes.length,
      batches,
      vectors,
      skipped,
    };
  }

  private async pairOf(symbol: string): Promise<{ id: string }> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (pair === null) {
      insufficientData('feature vector', { symbol, reason: 'unknown pair' });
    }
    return pair;
  }

  private async loadNews(asOf: Date): Promise<FeatureNewsInput[]> {
    const rows = await this.prisma.getClient().newsArticle.findMany({
      where: {
        publishedAt: { gte: new Date(asOf.getTime() - NEWS_LOOKBACK_MS), lte: asOf },
      },
      select: {
        publishedAt: true,
        currencies: true,
        analysis: {
          select: { sentiment: true, impact: true, confidence: true, affectedPairs: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    });
    return rows.flatMap((row) =>
      row.analysis === null
        ? []
        : [
            {
              publishedAt: row.publishedAt.toISOString(),
              currencies: row.currencies,
              affectedPairs: row.analysis.affectedPairs,
              sentiment: row.analysis.sentiment,
              impact: row.analysis.impact,
              confidence: Number(row.analysis.confidence),
            },
          ],
    );
  }

  private async loadEvents(asOf: Date): Promise<FeatureEventInput[]> {
    const rows = await this.prisma.getClient().economicEvent.findMany({
      where: {
        scheduledAt: { gt: asOf },
        impact: { in: [NewsImpact.HIGH, NewsImpact.EXTREME] },
      },
      select: { scheduledAt: true, currency: true, impact: true },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
    return rows.map((row) => ({
      scheduledAt: row.scheduledAt.toISOString(),
      currency: row.currency,
      impact: row.impact,
    }));
  }

  private async upsertBatch(
    pairId: string,
    timeframe: Timeframe,
    featureVersion: string,
    response: FeaturesResponse,
    timestamps: readonly string[],
  ): Promise<void> {
    const client = this.prisma.getClient();
    await Promise.all(
      response.vectors.map((vector, index) => {
        const timestamp = new Date(timestamps[index]);
        const key = {
          pairId,
          timeframe,
          timestamp,
          featureVersion,
        };
        const data = {
          values: vector.features,
          label: { source: 'ai-engine', featureVersion },
        };
        return client.marketFeature.upsert({
          where: { feature_pair_timeframe_timestamp_version_key: key },
          create: { ...key, ...data },
          update: data,
        });
      }),
    );
  }
}
