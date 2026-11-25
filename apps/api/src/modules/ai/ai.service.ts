import { Injectable, NotFoundException } from '@nestjs/common';
import type { AssistantResponse, CombinedAssessmentView, ExplanationResult } from '@ts/types';
import type { AssistantRequest, ExplainRequest, SymbolParam } from '@ts/validation';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../prisma/prisma.service';
import { PredictionService } from '../prediction/prediction.service';
import { mapSignal } from '../signals/signal.mapper';
import { AiEngineClient } from '../technical-analysis/ai-engine.client';
import {
  buildExplanationPayload,
  confidencePercent,
  explanationEvidence,
  latestDecision,
  persistAnalysis,
  safeExplain,
  boundedNumber,
} from './evidence';
import type { AssistantFact } from '@ts/validation';

export abstract class AiService {
  abstract assessment(symbol: SymbolParam): Promise<CombinedAssessmentView>;
  abstract explain(input: ExplainRequest): Promise<ExplanationResult>;
  abstract assistant(input: AssistantRequest): Promise<AssistantResponse>;
}

/** P17 — real, retrieval-first AI surface. No method fabricates domain data. */
@Injectable()
export class Phase17AiService extends AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiEngineClient,
    private readonly predictions: PredictionService,
    private readonly logger: JsonLogger,
  ) {
    super();
  }

  assessment(symbol: SymbolParam): Promise<CombinedAssessmentView> {
    return this.predictions.assessment(symbol);
  }

  async explain(input: ExplainRequest): Promise<ExplanationResult> {
    const signal = await this.prisma.getClient().tradeSignal.findUnique({
      where: { id: input.predictionId },
      include: { pair: true, features: true },
    });
    if (signal === null) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Prediction ${input.predictionId} was not found`,
        details: { predictionId: input.predictionId },
      });
    }

    const decision = mapSignal(signal);
    const components: Partial<
      Record<'technical' | 'historical' | 'ml' | 'news' | 'regime' | 'risk', number>
    > = decision.scores.components ?? {};
    const evidence = explanationEvidence(decision, decision.reasons, decision.noTradeReasons);
    const payload = buildExplanationPayload({
      symbol: decision.symbol,
      technicalScore: components.technical ?? boundedNumber(decision.scores.technical, 0) * 100,
      historicalScore: components.historical ?? boundedNumber(decision.scores.historical, 0) * 100,
      newsScore: components.news ?? boundedNumber(decision.scores.news, 0) * 100,
      modelProbability: decision.probability,
      confidence: confidencePercent(decision.confidence),
      risk: decision.riskLevel,
      marketRegime: decision.regime ?? 'UNCERTAIN',
      riskReward: decision.riskReward ?? 1,
      dataFreshnessSeconds: decision.dataFreshnessSeconds ?? 0,
      modelVersion: decision.modelVersion ?? decision.scores.modelVersion ?? 'deterministic-v1',
    });

    const request = {
      predictionId: decision.id,
      payload,
      decision: decision.action,
      supportingEvidence: evidence.supporting,
      contradictingEvidence: evidence.contradicting,
      reasons: decision.reasons,
      noTradeReasons: decision.noTradeReasons,
      timestamp: decision.generatedAt,
    };
    const result = await safeExplain(this.ai, request);
    await persistAnalysis(this.prisma, result, {
      subjectType: 'PREDICTION',
      subjectId: decision.id,
      signalId: decision.id,
      dataFreshnessSeconds: payload.dataFreshnessSeconds,
      supporting: evidence.supporting,
      contradicting: evidence.contradicting,
      timestamp: decision.generatedAt,
    });
    this.logger.log(`explanation produced for ${decision.symbol}`, 'AI', {
      predictionId: decision.id,
      source: result.explanationSource,
      model: result.llmModel,
      payloadHash: result.payloadHash,
    });
    return result;
  }

  /** Every source string comes from the DB/cache; no live information is invented. */
  async assistant(input: AssistantRequest): Promise<AssistantResponse> {
    const facts = await this.retrieveFacts(input.message);
    const response = await this.ai.assistantRequest({
      message: input.message,
      facts,
      ...(input.history === undefined ? {} : { history: input.history }),
    });
    this.logger.log('assistant answered from retrieved facts', 'AI', {
      facts: facts.length,
      grounded: response.grounded,
      explanationSource: response.explanationSource,
    });
    return response;
  }

  private async retrieveFacts(message: string): Promise<AssistantFact[]> {
    const symbols = this.symbolsIn(message);
    const client = this.prisma.getClient();
    const pairs = await client.currencyPair.findMany({
      where: symbols.length > 0 ? { symbol: { in: symbols } } : { isActive: true },
      select: { symbol: true },
      take: 12,
      orderBy: { symbol: 'asc' },
    });
    const terms =
      symbols.length === 0
        ? []
        : symbols.flatMap((symbol) => [symbol, symbol.split('/')[0], symbol.split('/')[1]]);
    const news = await client.newsAnalysis.findMany({
      where:
        terms.length === 0
          ? {}
          : {
              OR: [
                { affectedPairs: { hasSome: symbols } },
                { article: { currencies: { hasSome: terms } } },
              ],
            },
      include: { article: { select: { title: true, publishedAt: true } } },
      orderBy: { analyzedAt: 'desc' },
      take: 6,
    });

    const facts: AssistantFact[] = [];
    for (const pair of pairs) {
      const decision = await latestDecision(this.prisma, pair.symbol);
      if (decision !== null) {
        facts.push({
          kind: 'ASSESSMENT',
          symbol: pair.symbol,
          label: 'Decision',
          value: `${decision.action} (score ${decision.score})`,
          observedAt: decision.generatedAt,
        });
        if (decision.noTradeReasons.length > 0) {
          facts.push({
            kind: 'NO_TRADE',
            symbol: pair.symbol,
            label: 'No-trade reasons',
            value: decision.noTradeReasons.join(', '),
            observedAt: decision.generatedAt,
          });
        }
      }
      const indicators = await client.technicalIndicator.findMany({
        where: { pair: { symbol: pair.symbol } },
        select: { name: true, value: true, timestamp: true },
        orderBy: { timestamp: 'desc' },
        take: 3,
      });
      for (const indicator of indicators) {
        facts.push({
          kind: 'INDICATOR',
          symbol: pair.symbol,
          label: indicator.name,
          value: this.jsonValue(indicator.value),
          observedAt: indicator.timestamp.toISOString(),
        });
      }
    }
    for (const item of news) {
      facts.push({
        kind: 'NEWS',
        symbol: item.affectedPairs[0] ?? 'MARKET',
        label: `${item.eventType} (${item.sentiment}, ${item.impact})`,
        value: item.article.title,
        observedAt: item.analyzedAt.toISOString(),
      });
    }
    return facts.slice(0, 12);
  }

  private symbolsIn(message: string): string[] {
    const found = new Set<string>();
    const codes = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
    const pairPattern = new RegExp(`\\b(${codes.join('|')})/(${codes.join('|')})\\b`, 'g');
    for (const match of message.matchAll(pairPattern)) found.add(`${match[1]}/${match[2]}`);
    if (found.size === 0) {
      for (const code of codes) {
        if (new RegExp(`\\b${code}\\b`).test(message)) found.add(code);
      }
    }
    return [...found];
  }

  private jsonValue(value: unknown): string {
    if (value === null || value === undefined) return 'unavailable';
    if (typeof value !== 'object') return String(value);
    const record = value as Record<string, unknown>;
    if ('value' in record) return this.jsonValue(record.value);
    return JSON.stringify(value);
  }
}

/** Backwards-compatible binding used by earlier module tests. */
export { Phase17AiService as Phase7AiService };
