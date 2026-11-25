import type { Prisma } from '@ts/database';
import type {
  CombinedAssessmentView,
  EvidenceItem,
  ExplanationPayload,
  ExplanationResult,
  PredictResponse,
  RiskAssessment,
  TradeSignal,
} from '@ts/types';
import type { ExplanationRequestV2, ExplanationResultV2 } from '@ts/validation';
import { PrismaService } from '../prisma/prisma.service';
import { mapSignal } from '../signals/signal.mapper';
import type { AiEngineClient } from '../technical-analysis/ai-engine.client';
import { templateExplanation } from './template';

type EvidenceLike = { source: string; claim: string; value?: unknown };

const EMPTY_EVIDENCE: EvidenceLike[] = [];

function number(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

/** Signals store confidence as 0–1; the explanation contract uses 0–100. */
export function confidencePercent(value: unknown): number {
  const raw = number(value);
  return raw >= 0 && raw <= 1 ? raw * 100 : raw;
}

/** All numbers handed to the LLM come from persisted P16 decision evidence. */
export function buildExplanationPayload(input: {
  symbol: string;
  technicalScore: number;
  historicalScore: number;
  newsScore: number;
  modelProbability: number;
  confidence: number;
  risk: ExplanationPayload['risk'];
  marketRegime: string;
  riskReward: number;
  dataFreshnessSeconds: number;
  modelVersion: string;
}): ExplanationPayload {
  return {
    symbol: input.symbol,
    technicalScore: number(input.technicalScore),
    historicalScore: number(input.historicalScore),
    newsScore: number(input.newsScore),
    modelProbability: Math.max(0, Math.min(1, number(input.modelProbability))),
    confidence: Math.max(0, number(input.confidence)),
    risk: input.risk,
    marketRegime: text(input.marketRegime, 'UNCERTAIN') as ExplanationPayload['marketRegime'],
    riskReward: number(input.riskReward),
    dataFreshnessSeconds: Math.max(0, number(input.dataFreshnessSeconds)),
    modelVersion: text(input.modelVersion, 'deterministic-v1'),
  };
}

export function explanationEvidence(
  signal: TradeSignal | null,
  reasons: readonly string[],
  noTradeReasons: readonly string[],
): { supporting: EvidenceLike[]; contradicting: EvidenceLike[] } {
  const supporting =
    signal?.scores?.supportingEvidence ??
    reasons.map((claim, index) => ({ source: `reason-${index + 1}`, claim }));
  const contradicting =
    signal?.scores?.contradictingEvidence ??
    noTradeReasons.map((claim, index) => ({ source: `no-trade-${index + 1}`, claim }));
  return {
    supporting: supporting.length > 0 ? supporting : EMPTY_EVIDENCE,
    contradicting: contradicting.length > 0 ? contradicting : EMPTY_EVIDENCE,
  };
}

export interface ExplanationAssembly {
  symbol: string;
  asOf: string;
  technicalScore: number;
  historicalScore: number;
  newsScore: number;
  prediction: PredictResponse | null;
  decision: TradeSignal | null;
  risk: RiskAssessment | null;
  dataFreshnessSeconds?: number;
}

/** Build the *only* request shape accepted by the Python explanation engine. */
export function explanationFromView(
  view: ExplanationAssembly,
  options: { decision?: TradeSignal | null; risk?: RiskAssessment | null } = {},
): ExplanationRequestV2 {
  const decision = options.decision ?? view.decision;
  const risk = options.risk ?? view.risk;
  const components: Partial<
    Record<'technical' | 'historical' | 'ml' | 'news' | 'regime' | 'risk', number>
  > = decision?.scores?.components ?? {};
  const supportingSource = explanationEvidence(
    decision,
    decision?.reasons ?? [],
    decision?.noTradeReasons ?? [],
  );
  const modelProbability = decision?.probability ?? view.prediction?.probability ?? 0;
  const confidence = confidencePercent(decision?.confidence ?? view.prediction?.confidence ?? 0);
  const riskLevel = decision?.riskLevel ?? view.prediction?.riskLevel ?? 'MEDIUM';
  const riskReward =
    decision?.riskReward ??
    (risk !== null && Number.isFinite(risk.riskReward) ? risk.riskReward : 1);
  const freshness = decision?.dataFreshnessSeconds ?? view.dataFreshnessSeconds ?? 0;
  const modelVersion =
    decision?.modelVersion ??
    decision?.scores?.modelVersion ??
    view.prediction?.modelVersion ??
    'deterministic-v1';

  const payload = buildExplanationPayload({
    symbol: view.symbol,
    technicalScore: number(components.technical, view.technicalScore),
    historicalScore: number(components.historical, view.historicalScore),
    newsScore: number(components.news, view.newsScore),
    modelProbability,
    confidence,
    risk: riskLevel,
    marketRegime: decision?.regime ?? view.prediction?.direction ?? 'UNCERTAIN',
    riskReward,
    dataFreshnessSeconds: freshness,
    modelVersion,
  });

  return {
    predictionId: decision?.id ?? `assessment:${view.symbol}:${view.asOf}`,
    payload,
    decision: decision?.action ?? 'WATCH',
    supportingEvidence: supportingSource.supporting,
    contradictingEvidence: supportingSource.contradicting,
    reasons: decision?.reasons ?? [],
    noTradeReasons: decision?.noTradeReasons ?? [],
    timestamp: view.asOf,
  };
}

/** LLM outage must never remove an explanation from an assessment. */
export async function safeExplain(
  ai: AiEngineClient,
  request: ExplanationRequestV2,
): Promise<ExplanationResultV2> {
  try {
    return await ai.explain(request);
  } catch {
    return templateExplanation(request);
  }
}

function json<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Prisma enum predates the shared type: map rather than migrate the schema. */
function prismaSubjectType(
  subject: 'SIGNAL' | 'PREDICTION' | 'ASSESSMENT' | 'REPORT',
): 'PAIR' | 'SIGNAL' | 'REPORT' {
  if (subject === 'REPORT') return 'REPORT';
  if (subject === 'SIGNAL' || subject === 'PREDICTION') return 'SIGNAL';
  return 'PAIR';
}

/** Auditable AIAnalysis row. No schema change: hash/source live in the JSON evidence. */
export async function persistAnalysis(
  prisma: PrismaService,
  result: ExplanationResult | ExplanationResultV2,
  meta: {
    subjectType?: 'SIGNAL' | 'PREDICTION' | 'ASSESSMENT' | 'REPORT';
    subjectId?: string;
    signalId?: string;
    dataFreshnessSeconds: number;
    supporting: EvidenceLike[];
    contradicting: EvidenceLike[];
    timestamp: string;
  },
): Promise<string | null> {
  try {
    const freshness = Math.max(0, number(meta.dataFreshnessSeconds));
    const observedAt = new Date(Date.now() - freshness * 1000);
    const row = await prisma.getClient().aIAnalysis.create({
      data: {
        subjectType: prismaSubjectType(meta.subjectType ?? 'ASSESSMENT'),
        subjectId: meta.subjectId ?? result.predictionId,
        ...(meta.signalId === undefined ? {} : { signalId: meta.signalId }),
        summary: result.summary,
        supportingEvidence: json({
          payloadHash: result.payloadHash,
          explanationSource: result.explanationSource,
          validation: result.validation,
          items: meta.supporting,
        }),
        contradictingEvidence: json({
          payloadHash: result.payloadHash,
          explanationSource: result.explanationSource,
          items: meta.contradicting,
        }),
        explanationText: result.explanationText,
        llmModel: result.llmModel,
        dataFreshness: Number.isNaN(observedAt.getTime()) ? null : observedAt,
        timestamp: new Date(meta.timestamp),
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    // Explanations are an augmentation: persistence problems must not erase the view.
    return null;
  }
}

/** Latest persisted P16 decision for a symbol, mapped to the shared contract. */
export async function latestDecision(
  prisma: PrismaService,
  symbol: string,
): Promise<TradeSignal | null> {
  const row = await prisma.getClient().tradeSignal.findFirst({
    where: { pair: { symbol } },
    include: { pair: true, features: true },
    orderBy: { generatedAt: 'desc' },
  });
  if (row === null) return null;
  // Import lazily to keep this helper usable from modules that do not own signals.
  return mapSignal(row);
}

export function viewEvidence(view: CombinedAssessmentView): EvidenceItem[] {
  return [
    {
      source: 'technical',
      claim: `Regime ${view.regime.regime} (confidence ${number(view.regime.confidence).toFixed(2)})`,
      value: view.regime.regime,
    },
    {
      source: 'historical',
      claim: `${view.historical.dataPoints} historical observations analysed`,
      value: view.historical.dataPoints,
    },
  ];
}

export { number as boundedNumber };
