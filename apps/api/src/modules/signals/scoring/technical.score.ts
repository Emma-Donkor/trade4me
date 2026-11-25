import { NEUTRAL_COMPONENT_SCORE } from '@ts/config';
import type { TechnicalAnalysisView } from '@ts/types';
import { clampScore, component, evidence, type ComponentScore } from './component';

/** P10 already owns the indicator math; P16 only normalises its verdict. */
export function scoreTechnical(
  technical: TechnicalAnalysisView | null | undefined,
): ComponentScore {
  if (technical === null || technical === undefined) {
    return component(
      NEUTRAL_COMPONENT_SCORE,
      [],
      [evidence('technical', 'Technical analysis has no current view', 'missing')],
      ['INSUFFICIENT_DATA'],
      'NEUTRAL',
    );
  }

  const { score, subScores, regime, evidenceCount } = technical.score;
  const trend = subScores.trend ?? NEUTRAL_COMPONENT_SCORE;
  const momentum = subScores.momentum ?? NEUTRAL_COMPONENT_SCORE;
  const bullish = trend >= 60 || momentum >= 60 || regime === 'STRONG_UPTREND';
  const bearish = trend <= 40 || momentum <= 40 || regime === 'STRONG_DOWNTREND';
  const reasons = bullish && bearish ? (['CONFLICTING_INDICATORS'] as const) : ([] as const);
  const direction = bullish && !bearish ? 'LONG' : bearish && !bullish ? 'SHORT' : 'NEUTRAL';
  const claim = `Technical score ${clampScore(score)} with ${evidenceCount} indicator views`;
  const item = evidence('technical', claim, clampScore(score));

  return component(
    score,
    score >= 50 ? [item] : [],
    score < 50 ? [item] : [],
    [...reasons],
    direction,
  );
}
