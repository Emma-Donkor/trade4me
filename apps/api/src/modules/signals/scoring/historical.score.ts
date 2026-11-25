import { MIN_HISTORICAL_DATA_POINTS, MIN_SIMILAR_WINDOWS } from '@ts/config';
import type { HistoricalAnalysisView } from '@ts/types';
import { clampScore, component, evidence, type ComponentScore } from './component';

/** P09/P12 evidence only: similar windows are weighted by distance. */
export function scoreHistorical(
  historical: HistoricalAnalysisView | null | undefined,
): ComponentScore {
  const missing = evidence(
    'historical',
    'No comparable historical windows are available',
    'missing',
  );
  if (
    historical === null ||
    historical === undefined ||
    historical.dataPoints < MIN_HISTORICAL_DATA_POINTS ||
    historical.similarConditions.length < MIN_SIMILAR_WINDOWS
  ) {
    return component(50, [], [missing], ['INSUFFICIENT_HISTORICAL_EVIDENCE'], 'NEUTRAL');
  }

  const totalWeight = historical.similarConditions.reduce(
    (total, window) => total + 1 / (1 + Math.max(0, window.distance)),
    0,
  );
  const averageChange =
    historical.similarConditions.reduce(
      (total, window) => total + (window.changePct * 1) / (1 + Math.max(0, window.distance)),
      0,
    ) / totalWeight;
  const score = clampScore(50 + averageChange * 25);
  const direction = averageChange > 0.5 ? 'LONG' : averageChange < -0.5 ? 'SHORT' : 'NEUTRAL';
  const item = evidence(
    'historical',
    `${historical.similarConditions.length} comparable windows average ${averageChange.toFixed(3)}%`,
    Number(averageChange.toFixed(4)),
  );

  return component(score, score >= 50 ? [item] : [], score < 50 ? [item] : [], [], direction);
}
