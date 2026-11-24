import { Injectable } from '@nestjs/common';
import { SCORE_BANDS, TECHNICAL_SUBWEIGHTS } from '@ts/config';
import type { MarketRegime, TechnicalScoreBreakdown } from '@ts/types';

const REGIMES: readonly MarketRegime[] = [
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RANGE',
  'WEAK_DOWNTREND',
  'STRONG_DOWNTREND',
  'HIGH_VOLATILITY',
  'LOW_VOLATILITY',
  'UNCERTAIN',
];

interface RawScore {
  score?: unknown;
  subScores?: unknown;
  weights?: unknown;
  regime?: unknown;
  evidenceCount?: unknown;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function numberMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

/**
 * API-side guard for the Python score. It never recomputes the math; it only
 * enforces the configured weight manifest and score bands from `@ts/config`.
 */
@Injectable()
export class ScoreService {
  normalise(raw: unknown): TechnicalScoreBreakdown {
    const score = raw as RawScore;
    const numericScore = typeof score.score === 'number' ? score.score : 50;
    const value = Math.round(clamp(numericScore) * 100) / 100;
    const subScores = numberMap(score.subScores);
    const weights = numberMap(score.weights);
    const configured = Object.entries(TECHNICAL_SUBWEIGHTS);
    const configuredWeights = Object.fromEntries(
      configured.map(([key, weight]) => [key, weights[key] ?? weight]),
    );
    const regime = REGIMES.includes(score.regime as MarketRegime)
      ? (score.regime as MarketRegime)
      : 'UNCERTAIN';
    return {
      score: value,
      subScores: Object.fromEntries(
        configured.map(([key, weight]) => [key, subScores[key] ?? weight * value]),
      ),
      weights: configuredWeights,
      regime,
      evidenceCount: typeof score.evidenceCount === 'number' ? Math.max(0, score.evidenceCount) : 0,
      band: SCORE_BANDS.find((band) => value >= band.min && value <= band.max),
    };
  }
}
