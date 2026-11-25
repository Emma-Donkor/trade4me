import { CONFLICT_SCORE_PENALTY, DIRECTIONAL_ACTION_MIN_SCORE } from '@ts/config';
import type {
  DecisionEvidenceBundle,
  DecisionResult,
  Direction,
  EvidenceItem,
  NoTradeReason,
  RiskLevel,
  SignalComponent,
} from '@ts/types';
import { bandForScore } from './bands';
import { assembleEvidence, withFallbackEvidence } from './evidence';
import { evaluateNoTrade } from './no-trade';
import {
  SIGNAL_COMPONENTS,
  clampScore,
  combineComponentScores,
  component,
  evidence,
  scoreHistorical,
  scoreMl,
  scoreNews,
  scoreRegime,
  scoreRisk,
  scoreTechnical,
  snapshotScores,
} from './scoring';

function isDirection(value: unknown): value is Direction {
  return value === 'LONG' || value === 'SHORT' || value === 'NEUTRAL';
}

function consensus(votes: readonly Direction[]): { direction: Direction; conflict: boolean } {
  const long = votes.filter((vote) => vote === 'LONG').length;
  const short = votes.filter((vote) => vote === 'SHORT').length;
  const conflict = long > 0 && short > 0;
  if (conflict) {
    if (long > short) return { direction: 'LONG', conflict };
    if (short > long) return { direction: 'SHORT', conflict };
    return { direction: 'NEUTRAL', conflict };
  }
  if (long > 0) return { direction: 'LONG', conflict };
  if (short > 0) return { direction: 'SHORT', conflict };
  return { direction: 'NEUTRAL', conflict };
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function volatilityOf(bundle: DecisionEvidenceBundle): number | undefined {
  return (
    numeric(bundle.featureVector?.features.atr_pct) ??
    numeric(bundle.featureVector?.features.realized_vol_pct) ??
    numeric(bundle.historical?.volatility.periodPct)
  );
}

function riskLevelOf(bundle: DecisionEvidenceBundle, volatilityPct: number | undefined): RiskLevel {
  if (bundle.risk?.status === 'BLOCK') return (volatilityPct ?? 0) >= 30 ? 'EXTREME' : 'HIGH';
  if (bundle.prediction?.riskLevel !== undefined) return bundle.prediction.riskLevel;
  if ((volatilityPct ?? 0) >= 25) return 'HIGH';
  if ((volatilityPct ?? 0) >= 10) return 'MEDIUM';
  return 'LOW';
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

/**
 * P16's only decision authority. Pure by contract: no I/O, no clocks, no AI.
 * The caller supplies an evidence bundle and a weights snapshot; the same
 * bundle always produces the same verdict.
 */
export function decide(bundle: DecisionEvidenceBundle): DecisionResult {
  const scores = {
    technical: scoreTechnical(bundle.technical),
    historical: scoreHistorical(bundle.historical),
    ml: scoreMl(bundle.prediction, bundle.signalPolicy),
    news: scoreNews(bundle.news),
    regime: scoreRegime(bundle.technical?.regime.regime),
    risk: scoreRisk(bundle.risk),
  } satisfies Record<SignalComponent, ReturnType<typeof component>>;

  const componentScores = Object.fromEntries(
    SIGNAL_COMPONENTS.map((name) => [name, scores[name].score]),
  ) as Record<SignalComponent, number>;

  let score = combineComponentScores(componentScores, bundle.weights);
  const nonMlVotes = [
    scores.technical.direction,
    scores.historical.direction,
    scores.news.direction,
    scores.regime.direction,
  ].filter(isDirection);
  const marketConsensus = consensus(nonMlVotes);
  const modelDirection = scores.ml.direction;
  const modelDisagreement =
    modelDirection !== undefined &&
    modelDirection !== 'NEUTRAL' &&
    marketConsensus.direction !== 'NEUTRAL' &&
    modelDirection !== marketConsensus.direction;
  const direction = consensus([
    ...nonMlVotes,
    ...(isDirection(modelDirection) ? [modelDirection] : []),
  ]);
  const conflict = marketConsensus.conflict || direction.conflict;
  const penaltyEvidence: EvidenceItem[] = [];
  if (conflict || modelDisagreement) {
    score = clampScore(score - CONFLICT_SCORE_PENALTY);
    penaltyEvidence.push(
      evidence(
        'decision',
        `Conflict penalty of ${CONFLICT_SCORE_PENALTY} applied to the weighted score`,
        CONFLICT_SCORE_PENALTY,
      ),
    );
  }

  const volatilityPct = volatilityOf(bundle);
  const providerReasons = SIGNAL_COMPONENTS.flatMap((name) => scores[name].reasons);
  const noTrade = evaluateNoTrade({
    risk: bundle.risk,
    prediction: bundle.prediction,
    featureVector: bundle.featureVector,
    historical: bundle.historical,
    technicalPresent: bundle.technical !== null && bundle.technical !== undefined,
    newsPresent: bundle.news !== null && bundle.news !== undefined,
    dataFreshnessSeconds: bundle.dataFreshnessSeconds,
    volatilityPct,
    regime: bundle.technical?.regime.regime,
    conflictingIndicators: conflict,
    modelDisagreement,
    imminentEvents: bundle.imminentEvents,
    providerReasons,
  });

  const band = bandForScore(score);
  const assembled = withFallbackEvidence(
    assembleEvidence(Object.values(scores), {
      supporting: [],
      contradicting: [...noTrade.evidence, ...penaltyEvidence],
    }),
    evidence('decision', `Weighted score ${score} maps to ${band}`, score),
  );

  const action =
    noTrade.reasons.length > 0
      ? 'NO_TRADE'
      : direction.direction !== 'NEUTRAL' && score >= DIRECTIONAL_ACTION_MIN_SCORE
        ? direction.direction
        : 'WATCH';
  const noTradeReasons: NoTradeReason[] = noTrade.reasons;

  const reasons = unique([
    ...assembled.supporting.slice(0, 6).map((item) => `${item.source}: ${item.claim}`),
    ...assembled.contradicting.slice(0, 6).map((item) => `${item.source}: ${item.claim}`),
    ...noTradeReasons.map((reason) => `NO_TRADE: ${reason}`),
  ]);

  const persistedScores = snapshotScores({
    weights: bundle.weights,
    version: bundle.weightsVersion,
    components: componentScores,
    band,
    ...(bundle.technical?.regime.regime === undefined
      ? {}
      : { marketRegime: bundle.technical.regime.regime }),
    ...(bundle.prediction?.modelVersion === undefined
      ? {}
      : { modelVersion: bundle.prediction.modelVersion }),
    ...(bundle.dataFreshnessSeconds === undefined
      ? {}
      : { dataFreshnessSeconds: bundle.dataFreshnessSeconds }),
    supportingEvidence: assembled.supporting,
    contradictingEvidence: assembled.contradicting,
  });

  return {
    score,
    band,
    action,
    direction: direction.direction,
    probability: bundle.prediction?.probability ?? 0,
    confidence: bundle.prediction?.confidence ?? 0,
    riskLevel: riskLevelOf(bundle, volatilityPct),
    scores: persistedScores,
    componentScores,
    reasons,
    noTradeReasons,
    supportingEvidence: assembled.supporting,
    contradictingEvidence: assembled.contradicting,
    ...(bundle.prediction?.modelVersion === undefined
      ? {}
      : { modelVersion: bundle.prediction.modelVersion }),
    ...(bundle.dataFreshnessSeconds === undefined
      ? {}
      : { dataFreshnessSeconds: bundle.dataFreshnessSeconds }),
    ...(volatilityPct === undefined ? {} : { volatilityPct }),
    ...(bundle.technical === null || bundle.technical === undefined
      ? {}
      : { regime: bundle.technical.regime.regime }),
    ...(bundle.order === undefined ? {} : { ...bundle.order }),
    ...(bundle.risk === undefined || bundle.risk === null
      ? {}
      : { riskReward: bundle.risk.riskReward }),
  };
}
