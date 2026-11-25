import {
  env,
  FEATURE_NAMES,
  MIN_HISTORICAL_DATA_POINTS,
  MIN_SIGNAL_CONFIDENCE,
  MIN_SIMILAR_WINDOWS,
  NEWS_RISK_WINDOW_MINUTES,
  RISK_HARD_CAPS,
} from '@ts/config';
import type {
  EvidenceItem,
  FeatureVector,
  HistoricalAnalysisView,
  MarketRegime,
  NoTradeReason,
  PredictResponse,
  RiskAssessment,
} from '@ts/types';
import { evidence } from './scoring/component';

const REASON_ORDER: readonly NoTradeReason[] = [
  'LOW_MODEL_CONFIDENCE',
  'CONFLICTING_INDICATORS',
  'POOR_RISK_REWARD',
  'EXTREME_VOLATILITY',
  'STALE_MARKET_DATA',
  'INSUFFICIENT_HISTORICAL_EVIDENCE',
  'HIGH_IMPACT_EVENT',
  'INSUFFICIENT_DATA',
  'MODEL_DISAGREEMENT',
  'UNUSUAL_MARKET_REGIME',
];

export interface NoTradeInput {
  risk?: RiskAssessment | null;
  prediction?: PredictResponse | null;
  featureVector?: FeatureVector | null;
  historical?: HistoricalAnalysisView | null;
  technicalPresent?: boolean;
  newsPresent?: boolean;
  dataFreshnessSeconds?: number;
  volatilityPct?: number;
  regime?: MarketRegime;
  conflictingIndicators?: boolean;
  modelDisagreement?: boolean;
  imminentEvents?: readonly {
    eventName: string;
    currency: string;
    minutesUntil?: number;
  }[];
  providerReasons?: readonly NoTradeReason[];
}

export interface NoTradeVerdict {
  reasons: NoTradeReason[];
  evidence: EvidenceItem[];
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Every documented NO-TRADE gate, hard (P15) first and soft gates after. */
export function evaluateNoTrade(input: NoTradeInput): NoTradeVerdict {
  const found = new Set<NoTradeReason>();
  const add = (reason: NoTradeReason, claim: string, value: EvidenceItem['value']): void => {
    found.add(reason);
    evidenceByReason.set(reason, evidence('no-trade', claim, value));
  };
  const evidenceByReason = new Map<NoTradeReason, EvidenceItem>();

  if (input.risk !== null && input.risk !== undefined) {
    if (input.risk.status === 'BLOCK' || input.risk.action === 'NO_TRADE') {
      for (const reason of input.risk.noTradeReasons ?? []) {
        add(reason, `P15 risk rules blocked the setup with ${reason}`, reason);
      }
      if (found.size === 0) {
        add('INSUFFICIENT_DATA', 'P15 blocked the setup without a mapped reason', 'unmapped');
      }
    }
    if (input.risk.riskReward < 1.5) {
      add(
        'POOR_RISK_REWARD',
        `Risk/reward ${input.risk.riskReward} is below 1.5`,
        input.risk.riskReward,
      );
    }
  }

  for (const reason of input.providerReasons ?? []) {
    if (!found.has(reason)) add(reason, `A score provider reported ${reason}`, reason);
  }

  if (input.conflictingIndicators === true) {
    add('CONFLICTING_INDICATORS', 'Technical and news/regime directions conflict', 'conflict');
  }
  if (input.modelDisagreement === true) {
    add(
      'MODEL_DISAGREEMENT',
      'Model direction disagrees with the evidence consensus',
      'disagreement',
    );
  }
  if (input.regime === 'UNCERTAIN' || input.regime === 'HIGH_VOLATILITY') {
    add(
      'UNUSUAL_MARKET_REGIME',
      `Market regime ${input.regime} is not a clean trend`,
      input.regime,
    );
  }

  if (input.regime === undefined) {
    add('INSUFFICIENT_DATA', 'Market regime is unavailable', 'missing');
  }

  if (input.prediction !== null && input.prediction !== undefined) {
    if (input.prediction.confidence < MIN_SIGNAL_CONFIDENCE) {
      add(
        'LOW_MODEL_CONFIDENCE',
        `Model confidence ${input.prediction.confidence} is below ${MIN_SIGNAL_CONFIDENCE}`,
        input.prediction.confidence,
      );
    }
  } else {
    add('INSUFFICIENT_DATA', 'No promoted model prediction is available', 'missing');
  }

  if (input.dataFreshnessSeconds === undefined) {
    add('INSUFFICIENT_DATA', 'Market data freshness is unknown', 'missing');
  } else {
    const limit = Math.max(1, Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120));
    if (input.dataFreshnessSeconds > limit) {
      add(
        'STALE_MARKET_DATA',
        `Market data is ${input.dataFreshnessSeconds}s old (limit ${limit}s)`,
        input.dataFreshnessSeconds,
      );
    }
  }

  if (input.historical === null || input.historical === undefined) {
    add('INSUFFICIENT_HISTORICAL_EVIDENCE', 'Historical analysis is unavailable', 'missing');
  } else if (
    input.historical.dataPoints < MIN_HISTORICAL_DATA_POINTS ||
    input.historical.similarConditions.length < MIN_SIMILAR_WINDOWS
  ) {
    add(
      'INSUFFICIENT_HISTORICAL_EVIDENCE',
      `${input.historical.dataPoints} historical points and ${input.historical.similarConditions.length} comparable windows are insufficient`,
      input.historical.dataPoints,
    );
  }

  if (input.featureVector === null || input.featureVector === undefined) {
    add('INSUFFICIENT_DATA', 'No versioned feature vector is available', 'missing');
  } else {
    const missing = FEATURE_NAMES.filter(
      (name) => !Object.hasOwn(input.featureVector?.features ?? {}, name),
    );
    if (missing.length > 0) {
      add('INSUFFICIENT_DATA', `${missing.length} required features are missing`, missing.length);
    }
  }

  if (input.technicalPresent !== true) {
    add('INSUFFICIENT_DATA', 'Technical analysis is unavailable', 'missing');
  }
  if (input.newsPresent !== true) {
    add('INSUFFICIENT_DATA', 'Pair news sentiment is unavailable', 'missing');
  }
  if (input.risk === null || input.risk === undefined) {
    add('INSUFFICIENT_DATA', 'Risk assessment is unavailable', 'missing');
  }

  const imminent = (input.imminentEvents ?? []).find(
    (event) =>
      event.minutesUntil === undefined ||
      (event.minutesUntil >= 0 && event.minutesUntil <= NEWS_RISK_WINDOW_MINUTES),
  );
  if (imminent !== undefined) {
    add(
      'HIGH_IMPACT_EVENT',
      `${imminent.eventName} is imminent for ${imminent.currency}`,
      imminent.minutesUntil ?? 'unknown',
    );
  }

  const volatility =
    input.volatilityPct ??
    numeric(input.featureVector?.features.atr_pct) ??
    numeric(input.historical?.volatility.periodPct);
  if (volatility !== undefined && volatility >= RISK_HARD_CAPS.maxVolatilityPct) {
    add(
      'EXTREME_VOLATILITY',
      `Volatility ${volatility}% exceeds the ${RISK_HARD_CAPS.maxVolatilityPct}% hard cap`,
      volatility,
    );
  }

  const reasons = REASON_ORDER.filter((reason) => found.has(reason));
  return {
    reasons,
    evidence: reasons
      .map((reason) => evidenceByReason.get(reason))
      .filter((item): item is EvidenceItem => item !== undefined),
  };
}
