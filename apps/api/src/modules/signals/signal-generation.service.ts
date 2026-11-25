import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_ACCOUNT_BALANCE,
  FEATURE_MANIFEST_VERSION,
  FEATURE_NAMES,
  SIGNAL_MATERIAL_CHANGE_SCORE,
} from '@ts/config';
import { Prisma, type ModelStatus } from '@ts/database';
import type {
  DecisionEvidenceBundle,
  Direction,
  FeatureVector,
  RiskAssessment,
  TradeSignal,
} from '@ts/types';
import type { RiskEvaluateRequest } from '@ts/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsService } from '../websocket/events.service';
import { EconomicEventsService } from '../news/economic-events.service';
import { NewsAggregatorService } from '../news/aggregator.service';
import { PredictionEngineService } from '../prediction/prediction-engine.service';
import { RiskService } from '../risk/risk.service';
import { FeatureService } from '../market/feature.service';
import { QuoteService } from '../market/quote.service';
import { HistoricalAnalysisService } from '../historical-analysis/historical-analysis.service';
import { TechnicalAnalysisService } from '../technical-analysis/technical-analysis.service';
import { decide } from './decision.engine';
import { mapSignal } from './signal.mapper';
import { SCANNER_CACHE_KEY } from './scanner.constants';
import { DecisionWeightsService } from './scoring/weights.service';

const TIMEFRAME = 'H1' as const;

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function materialChange(previous: TradeSignal, next: TradeSignal): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  if (previous.action !== next.action) changes.action = next.action;
  if (Math.abs(previous.score - next.score) >= SIGNAL_MATERIAL_CHANGE_SCORE)
    changes.score = next.score;
  if (Math.abs(previous.probability - next.probability) >= 0.05) {
    changes.probability = next.probability;
  }
  if (previous.riskLevel !== next.riskLevel) changes.riskLevel = next.riskLevel;
  if (previous.noTradeReasons.join() !== next.noTradeReasons.join()) {
    changes.noTradeReasons = next.noTradeReasons;
  }
  return Object.keys(changes).length === 0 ? null : changes;
}

/** P16 — gathers P08–P15 evidence, runs the pure engine, persists and emits. */
@Injectable()
export class SignalGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
    private readonly technical: TechnicalAnalysisService,
    private readonly historical: HistoricalAnalysisService,
    private readonly predictions: PredictionEngineService,
    private readonly news: NewsAggregatorService,
    private readonly calendar: EconomicEventsService,
    private readonly risk: RiskService,
    private readonly quotes: QuoteService,
    private readonly wsEvents: EventsService,
    private readonly redis: RedisService,
    private readonly weights: DecisionWeightsService,
    private readonly logger: JsonLogger,
  ) {}

  /** One deterministic snapshot. `asOf` is explicit for P24 replay callers. */
  async generate(symbol: string, asOf: Date = new Date()): Promise<TradeSignal> {
    const pair = await this.prisma.getClient().currencyPair.findUnique({
      where: { symbol },
      select: { id: true, symbol: true },
    });
    if (pair === null) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Unknown currency pair ${symbol}`,
        details: { symbol },
      });
    }

    const featureVector = await this.optional(() => this.features.latest(symbol, TIMEFRAME, asOf));
    const technical = await this.optional(() =>
      this.technical.technical({ symbol }, { timeframe: TIMEFRAME }),
    );
    const historical = await this.optional(() =>
      this.historical.historical({ symbol }, { timeframe: TIMEFRAME, limit: 5 }),
    );
    const predictionEvaluation = await this.optional(() =>
      this.predictions.evaluate({ symbol }, TIMEFRAME),
    );
    const prediction = predictionEvaluation?.prediction ?? null;
    const modelStatus: ModelStatus | undefined = predictionEvaluation?.modelStatus;
    const signalPolicy = predictionEvaluation?.signalPolicy;
    const sentiment = await this.optional(() => this.news.pairSentiment(symbol, asOf));
    const events = await this.optional(() => this.calendar.imminentRisks(asOf));
    const quote = await this.optional(() => this.quotes.quotes([symbol], asOf));
    const quoteItem = quote?.items[0];
    const freshness = quoteItem?.dataFreshnessSeconds;

    const volatilityPct =
      numeric(featureVector?.features.atr_pct) ??
      numeric(featureVector?.features.realized_vol_pct) ??
      numeric(historical?.volatility.periodPct);
    const missingFeatures = featureVector
      ? FEATURE_NAMES.filter((name) => !Object.hasOwn(featureVector.features, name))
      : [...FEATURE_NAMES];
    const imminentEvents = (events ?? []).map((event) => ({
      eventName: event.eventName,
      currency: event.currency,
      ...(event.minutesUntil === undefined ? {} : { minutesUntil: event.minutesUntil }),
    }));

    const side: Direction =
      prediction?.direction === 'LONG' || prediction?.direction === 'SHORT'
        ? prediction.direction
        : technical?.regime.regime === 'STRONG_UPTREND' ||
            technical?.regime.regime === 'WEAK_UPTREND'
          ? 'LONG'
          : technical?.regime.regime === 'STRONG_DOWNTREND' ||
              technical?.regime.regime === 'WEAK_DOWNTREND'
            ? 'SHORT'
            : 'LONG';
    const entry = Math.max(quoteItem?.bid ?? 1, 0.000001);
    const stopPct = Math.max(0.2, volatilityPct ?? 0.5) / 100;
    const stopLoss = Math.max(
      0.000001,
      side === 'LONG' ? entry * (1 - stopPct) : entry * (1 + stopPct),
    );
    const takeProfit = Math.max(
      0.000001,
      side === 'LONG' ? entry * (1 + stopPct * 2) : entry * (1 - stopPct * 2),
    );
    const order: RiskEvaluateRequest['order'] = {
      symbol,
      side: side === 'SHORT' ? 'SHORT' : 'LONG',
      entry,
      stopLoss,
      takeProfit,
      size: 0.1,
    };
    const risk = await this.optional<RiskAssessment>(() =>
      this.risk.assess({
        order,
        context: {
          balance: DEFAULT_ACCOUNT_BALANCE,
          ...(volatilityPct === undefined ? {} : { volatilityPct }),
          ...(prediction === undefined || prediction === null
            ? {}
            : { confidence: prediction.confidence }),
          ...(freshness === undefined ? {} : { dataFreshnessSeconds: freshness }),
          missingFeatures,
          imminentEvents,
        },
      }),
    );

    const resolvedWeights = this.weights.current();
    const bundle: DecisionEvidenceBundle = {
      symbol,
      asOf: asOf.toISOString(),
      timeframe: TIMEFRAME,
      weights: resolvedWeights.weights,
      weightsVersion: resolvedWeights.version,
      ...(technical === null ? {} : { technical }),
      ...(historical === null ? {} : { historical }),
      ...(prediction === null ? {} : { prediction }),
      ...(modelStatus === undefined ? {} : { modelStatus }),
      ...(signalPolicy === undefined ? {} : { signalPolicy }),
      ...(sentiment === null ? {} : { news: sentiment }),
      ...(risk === null ? {} : { risk }),
      ...(featureVector === null ? {} : { featureVector }),
      ...(imminentEvents.length === 0 ? {} : { imminentEvents }),
      ...(freshness === undefined ? {} : { dataFreshnessSeconds: freshness }),
      order,
    };
    const result = decide(bundle);
    const previousRow = await this.prisma.getClient().tradeSignal.findFirst({
      where: { pairId: pair.id },
      orderBy: { generatedAt: 'desc' },
      include: { pair: true },
    });
    const previous = previousRow === null ? null : mapSignal(previousRow);

    const row = await this.prisma.getClient().tradeSignal.create({
      data: {
        pairId: pair.id,
        action: result.action,
        score: result.score,
        probability: result.probability,
        confidence: result.confidence,
        riskLevel: result.riskLevel,
        direction: result.direction,
        entryPrice: result.entryPrice,
        stopLoss: result.stopLoss,
        takeProfit: result.takeProfit,
        riskReward: result.riskReward,
        scores: result.scores as unknown as Prisma.InputJsonValue,
        reasons: result.reasons,
        noTradeReasons: result.noTradeReasons,
        status: 'ACTIVE',
        generatedAt: asOf,
        features: {
          create: {
            featureVersion: featureVector?.featureVersion ?? FEATURE_MANIFEST_VERSION,
            values: (featureVector?.features ?? {
              available: false,
              reason: 'No versioned feature vector at generation time',
            }) as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: { pair: true, features: true },
    });
    const signal = mapSignal(row);
    await this.redis.del(SCANNER_CACHE_KEY);

    if (previous === null) {
      this.wsEvents.signalNew({
        signalId: signal.id,
        symbol,
        action: signal.action,
        score: signal.score,
      });
    } else {
      const changes = materialChange(previous, signal);
      if (changes !== null) {
        this.wsEvents.signalChanged({ signalId: signal.id, changes });
      }
    }
    this.logger.log('signal generated', 'SIGNALS', {
      symbol,
      action: signal.action,
      score: signal.score,
      band: signal.band,
      noTradeReasons: signal.noTradeReasons,
    });
    return signal;
  }

  /** Job entry point: one bad pair never prevents the rest of the scan. */
  async generateAll(symbols?: readonly string[], asOf: Date = new Date()): Promise<TradeSignal[]> {
    const target =
      symbols ??
      (
        await this.prisma.getClient().currencyPair.findMany({
          where: { isActive: true },
          select: { symbol: true },
          orderBy: { symbol: 'asc' },
        })
      ).map((pair) => pair.symbol);
    const generated: TradeSignal[] = [];
    for (const symbol of target) {
      try {
        generated.push(await this.generate(symbol, asOf));
      } catch (error) {
        this.logger.warn(
          `signal generation failed for ${symbol}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'SIGNALS',
        );
      }
    }
    return generated;
  }

  private async optional<T>(load: () => Promise<T>): Promise<T | null> {
    try {
      return await load();
    } catch {
      // Missing inputs become explicit NO-TRADE evidence, never fabricated data.
      return null;
    }
  }
}

export type { FeatureVector };
