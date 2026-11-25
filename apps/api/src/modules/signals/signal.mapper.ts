import { DEFAULT_DECISION_WEIGHTS } from '@ts/config';
import type { Prisma } from '@ts/database';
import type {
  Direction,
  EvidenceItem,
  MarketRegime,
  NoTradeReason,
  RiskLevel,
  SignalAction,
  SignalComponent,
  SignalScores,
  TradeSignal,
} from '@ts/types';
import { SIGNAL_COMPONENTS } from './scoring';

export interface SignalRow {
  id: string;
  pair: { symbol: string };
  action: SignalAction;
  score: Prisma.Decimal | number;
  probability: Prisma.Decimal | number;
  confidence: Prisma.Decimal | number;
  riskLevel: RiskLevel;
  direction: Direction;
  scores: Prisma.JsonValue;
  reasons: string[];
  noTradeReasons: string[];
  generatedAt: Date | string;
  entryPrice?: Prisma.Decimal | number | null;
  stopLoss?: Prisma.Decimal | number | null;
  takeProfit?: Prisma.Decimal | number | null;
  riskReward?: Prisma.Decimal | number | null;
  status: string;
  features?: Array<{ featureVersion: string; values: Prisma.JsonValue }>;
  analyses?: Array<{ id: string; explanationText: string | null }>;
}

export interface SignalDetail extends TradeSignal {
  status: string;
  featureVersion?: string;
  featureValues?: Prisma.JsonValue;
  analyses: Array<{ id: string; explanationText: string | null }>;
}

function number(value: Prisma.Decimal | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericRecord(value: unknown): Record<string, number> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
}

function evidenceList(value: unknown): EvidenceItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const row = objectOf(item);
    if (typeof row.source !== 'string' || typeof row.claim !== 'string') return [];
    return [
      { source: row.source, claim: row.claim, value: (row.value ?? null) as EvidenceItem['value'] },
    ];
  });
}

const REGIMES = new Set<MarketRegime>([
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RANGE',
  'WEAK_DOWNTREND',
  'STRONG_DOWNTREND',
  'HIGH_VOLATILITY',
  'LOW_VOLATILITY',
  'UNCERTAIN',
]);

function regimeOf(value: Prisma.JsonValue): MarketRegime | undefined {
  const raw = objectOf(value).regime;
  return typeof raw === 'string' && REGIMES.has(raw as MarketRegime)
    ? (raw as MarketRegime)
    : undefined;
}

export function scoresOf(value: Prisma.JsonValue): SignalScores {
  const raw = objectOf(value);
  const scores: SignalScores = { ...DEFAULT_DECISION_WEIGHTS };
  for (const component of SIGNAL_COMPONENTS) {
    const weight = raw[component];
    if (typeof weight === 'number' && Number.isFinite(weight)) scores[component] = weight;
  }
  const components = numericRecord(raw.components);
  if (components !== undefined) {
    scores.components = Object.fromEntries(
      SIGNAL_COMPONENTS.map((component) => [component, components[component] ?? 0]),
    ) as Record<SignalComponent, number>;
  }
  if (typeof raw.weightsVersion === 'string') scores.weightsVersion = raw.weightsVersion;
  if (typeof raw.band === 'string') scores.band = raw.band;
  if (typeof raw.modelVersion === 'string') scores.modelVersion = raw.modelVersion;
  const freshness = raw.dataFreshnessSeconds;
  if (typeof freshness === 'number') scores.dataFreshnessSeconds = freshness;
  const supporting = evidenceList(raw.supportingEvidence);
  if (supporting !== undefined) scores.supportingEvidence = supporting;
  const contradicting = evidenceList(raw.contradictingEvidence);
  if (contradicting !== undefined) scores.contradictingEvidence = contradicting;
  return scores;
}

export function mapSignal(row: SignalRow): TradeSignal {
  const scores = scoresOf(row.scores);
  const generatedAt =
    row.generatedAt instanceof Date
      ? row.generatedAt.toISOString()
      : new Date(row.generatedAt).toISOString();
  const entryPrice = number(row.entryPrice);
  const stopLoss = number(row.stopLoss);
  const takeProfit = number(row.takeProfit);
  const riskReward = number(row.riskReward);
  return {
    id: row.id,
    symbol: row.pair.symbol,
    action: row.action,
    direction: row.direction,
    score: number(row.score) ?? 0,
    probability: number(row.probability) ?? 0,
    confidence: number(row.confidence) ?? 0,
    riskLevel: row.riskLevel,
    scores,
    reasons: row.reasons,
    noTradeReasons: row.noTradeReasons as NoTradeReason[],
    generatedAt,
    ...(scores.components === undefined ? {} : { componentScores: scores.components }),
    ...(scores.weightsVersion === undefined ? {} : { weightsVersion: scores.weightsVersion }),
    ...(scores.band === undefined ? {} : { band: scores.band }),
    ...(regimeOf(row.scores) === undefined ? {} : { regime: regimeOf(row.scores) }),
    ...(scores.modelVersion === undefined ? {} : { modelVersion: scores.modelVersion }),
    ...(scores.dataFreshnessSeconds === undefined
      ? {}
      : { dataFreshnessSeconds: scores.dataFreshnessSeconds }),
    ...(scores.supportingEvidence === undefined
      ? {}
      : { supportingEvidence: scores.supportingEvidence }),
    ...(scores.contradictingEvidence === undefined
      ? {}
      : { contradictingEvidence: scores.contradictingEvidence }),
    ...(entryPrice === undefined ? {} : { entryPrice }),
    ...(stopLoss === undefined ? {} : { stopLoss }),
    ...(takeProfit === undefined ? {} : { takeProfit }),
    ...(riskReward === undefined ? {} : { riskReward }),
  };
}

export function mapSignalDetail(row: SignalRow): SignalDetail {
  const signal = mapSignal(row);
  const feature = row.features?.[0];
  return {
    ...signal,
    status: row.status,
    ...(feature === undefined ? {} : { featureVersion: feature.featureVersion }),
    ...(feature === undefined ? {} : { featureValues: feature.values }),
    analyses: row.analyses ?? [],
  };
}
