import { Injectable } from '@nestjs/common';
import { DEFAULT_ACCOUNT_BALANCE } from '@ts/config';
import type {
  CombinedAssessmentView,
  EvidenceItem,
  ExplanationResult,
  RiskAssessment,
  TradeSignal,
} from '@ts/types';
import type { MarketReportView, ReportInput, SymbolParam } from '@ts/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../prisma/prisma.service';
import { ReportService } from '../ai/report.service';
import {
  explanationFromView,
  latestDecision,
  persistAnalysis,
  safeExplain,
  viewEvidence,
} from '../ai/evidence';
import { NewsAggregatorService } from '../news/aggregator.service';
import { QuoteService } from '../market/quote.service';
import { RiskService } from '../risk/risk.service';
import { HistoricalAnalysisService } from '../historical-analysis/historical-analysis.service';
import { TechnicalAnalysisService } from '../technical-analysis/technical-analysis.service';
import { AiEngineClient } from '../technical-analysis/ai-engine.client';
import { EventsService } from '../websocket/events.service';
import { PredictionEngineService } from './prediction-engine.service';

export abstract class PredictionService {
  abstract assessment(symbol: SymbolParam): Promise<CombinedAssessmentView>;
  abstract report(symbol: SymbolParam): Promise<MarketReportView>;
}

/** P10/P14/P17 — a fully grounded combined view with deterministic fallbacks. */
@Injectable()
export class Phase10PredictionService extends PredictionService {
  constructor(
    private readonly technical: TechnicalAnalysisService,
    private readonly historical: HistoricalAnalysisService,
    private readonly events: EventsService,
    private readonly engine: PredictionEngineService,
    private readonly prisma: PrismaService,
    private readonly ai: AiEngineClient,
    private readonly news: NewsAggregatorService,
    private readonly risk: RiskService,
    private readonly quotes: QuoteService,
    private readonly reports: ReportService,
    private readonly logger: JsonLogger,
  ) {
    super();
  }

  async assessment(symbol: SymbolParam): Promise<CombinedAssessmentView> {
    const [technical, historical] = await Promise.all([
      this.technical.technical(symbol),
      this.historical.historical(symbol),
    ]);
    const predictionFields = await this.predictionFields(symbol, technical.timeframe);
    const [news, decision, marketQuote] = await Promise.all([
      this.optional(() => this.news.pairSentiment(symbol.symbol)),
      this.optional(() => latestDecision(this.prisma, symbol.symbol)),
      this.optional(() => this.quotes.quotes([symbol.symbol])),
    ]);
    const risk = await this.optional(() =>
      this.risk.assess({
        order: this.hypotheticalOrder(
          symbol.symbol,
          decision,
          marketQuote?.items[0]?.bid,
          technical,
        ),
        context: {
          balance: DEFAULT_ACCOUNT_BALANCE,
          ...(predictionFields.prediction === null
            ? {}
            : { confidence: predictionFields.prediction.confidence }),
          ...(marketQuote?.items[0]?.dataFreshnessSeconds === undefined
            ? {}
            : { dataFreshnessSeconds: marketQuote.items[0].dataFreshnessSeconds }),
          missingFeatures: [],
        },
      }),
    );

    const explanation = await this.explain(symbol, {
      technical,
      historical,
      predictionFields,
      decision,
      risk,
      newsScore: news?.score ?? 0,
    });
    const view: CombinedAssessmentView = {
      symbol: symbol.symbol,
      timeframe: technical.timeframe,
      asOf: new Date().toISOString(),
      technical,
      historical,
      regime: technical.regime,
      ...predictionFields,
      news,
      risk,
      decision,
      explanation,
      // P10 contract stays stable: later phases add fields, never rename this one.
      pendingPhases: ['P11', 'P12'],
    };
    this.events.analysisUpdated({
      symbol: symbol.symbol,
      assessment: view as unknown as Record<string, unknown>,
    });
    return view;
  }

  async report(symbol: SymbolParam): Promise<MarketReportView> {
    const view = await this.assessment(symbol);
    const input: ReportInput = this.reportInput(view);
    return this.reports.generate(input);
  }

  /** Never turn an inference outage into an unavailable assessment. */
  private async predictionFields(
    symbol: SymbolParam,
    timeframe: CombinedAssessmentView['timeframe'],
  ): Promise<Pick<CombinedAssessmentView, 'prediction' | 'modelStatus' | 'signalPolicy'>> {
    try {
      return await this.engine.assessmentFields(symbol, timeframe);
    } catch (error) {
      this.logger.warn(
        `prediction unavailable for ${symbol.symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'PREDICTION',
      );
      const policy = PredictionEngineService.policy('TRAINING');
      return { prediction: null, modelStatus: 'TRAINING', signalPolicy: policy };
    }
  }

  private async explain(
    symbol: SymbolParam,
    input: {
      technical: CombinedAssessmentView['technical'];
      historical: CombinedAssessmentView['historical'];
      predictionFields: Pick<CombinedAssessmentView, 'prediction' | 'modelStatus' | 'signalPolicy'>;
      decision: TradeSignal | null;
      risk: RiskAssessment | null;
      newsScore: number;
    },
  ): Promise<ExplanationResult> {
    const asOf = new Date().toISOString();
    const request = explanationFromView(
      {
        symbol: symbol.symbol,
        asOf,
        technicalScore: input.technical.score.score,
        historicalScore: this.historicalScore(input.historical.dataPoints),
        newsScore: input.newsScore,
        prediction: input.predictionFields.prediction,
        decision: input.decision,
        risk: input.risk,
        dataFreshnessSeconds: input.decision?.dataFreshnessSeconds,
      },
      { decision: input.decision, risk: input.risk },
    );
    const result = await safeExplain(this.ai, request);
    await persistAnalysis(this.prisma, result, {
      subjectType: input.decision === null ? 'ASSESSMENT' : 'SIGNAL',
      subjectId: input.decision?.id ?? `${symbol.symbol}:${asOf}`,
      signalId: input.decision?.id,
      dataFreshnessSeconds: request.payload.dataFreshnessSeconds,
      supporting: request.supportingEvidence,
      contradicting: request.contradictingEvidence,
      timestamp: request.timestamp,
    });
    return result;
  }

  private historicalScore(dataPoints: number): number {
    if (!Number.isFinite(dataPoints) || dataPoints <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(Math.log10(dataPoints + 1) * 40)));
  }

  /** Assessment evidence is never invented: only persisted P16 scores are used. */
  private hypotheticalOrder(
    symbol: string,
    decision: TradeSignal | null,
    bid: number | undefined,
    technical: CombinedAssessmentView['technical'],
  ) {
    const entry = Math.max(decision?.entryPrice ?? bid ?? 1, 0.000001);
    const atr = technical.indicators.ATR14?.value;
    const atrValue =
      atr !== null && typeof atr === 'object' && 'value' in atr && typeof atr.value === 'number'
        ? atr.value
        : 0.0004;
    const stopPct = Math.max(0.2, Math.min(5, (atrValue / entry) * 100)) / 100;
    const side: 'LONG' | 'SHORT' =
      decision?.direction === 'SHORT' ||
      (decision === null && technical.regime.regime.includes('DOWN'))
        ? 'SHORT'
        : 'LONG';
    return {
      symbol,
      side,
      entry,
      stopLoss: Math.max(0.000001, side === 'LONG' ? entry * (1 - stopPct) : entry * (1 + stopPct)),
      takeProfit: Math.max(
        0.000001,
        side === 'LONG' ? entry * (1 + stopPct * 2) : entry * (1 - stopPct * 2),
      ),
      size: 0.1,
    };
  }

  private reportInput(view: CombinedAssessmentView): ReportInput {
    const decision = view.decision;
    const baseEvidence: EvidenceItem[] = viewEvidence(view);
    const supporting = decision?.scores.supportingEvidence ?? baseEvidence;
    const contradicting = decision?.scores.contradictingEvidence ?? [];
    const warnings = [
      ...contradicting.map((item) => item.claim),
      ...(decision?.noTradeReasons ?? []),
      ...(view.risk?.verdicts ?? [])
        .filter((verdict) => verdict.status !== 'PASS')
        .map((verdict) => `${verdict.rule}: ${verdict.message ?? verdict.status}`),
    ];
    return {
      symbol: view.symbol,
      asOf: view.asOf,
      summary: `Technical score ${view.technical.score.score} with regime ${view.regime.regime}`,
      trend: view.regime.regime,
      technicalEvidence: supporting.filter((item) => item.source.includes('technical')),
      historicalEvidence: supporting.filter((item) => item.source.includes('histor')),
      newsEvidence: [
        ...supporting.filter((item) => item.source.includes('news')),
        ...(view.news === null || view.news === undefined
          ? []
          : [
              {
                source: 'news',
                claim: `${view.news.sentiment} sentiment (score ${view.news.score})`,
                value: view.news.score,
              },
            ]),
      ],
      prediction:
        view.prediction === null
          ? null
          : {
              direction: view.prediction.direction,
              probability: view.prediction.probability,
              confidence: view.prediction.confidence,
              riskLevel: view.prediction.riskLevel,
              modelVersion: view.prediction.modelVersion,
            },
      risk:
        view.risk === null || view.risk === undefined
          ? null
          : {
              level: decision?.riskLevel ?? view.prediction?.riskLevel ?? 'MEDIUM',
              reasons: warnings,
              ...(Number.isFinite(view.risk.riskReward)
                ? { riskReward: view.risk.riskReward }
                : {}),
            },
      decision: decision?.action ?? 'WATCH',
      reasons: decision?.reasons ?? [],
      warnings,
    };
  }

  private async optional<T>(load: () => Promise<T>): Promise<T | null> {
    try {
      return await load();
    } catch (error) {
      this.logger.warn(
        `optional assessment input unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'PREDICTION',
      );
      return null;
    }
  }
}

/** Backwards-compatible name used by the P07 module wiring/tests. */
export { Phase10PredictionService as Phase7PredictionService };
