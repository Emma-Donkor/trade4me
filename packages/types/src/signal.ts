import type { Direction, PredictResponse, RiskLevel, Timeframe } from './contracts';
import type { HistoricalAnalysisView, MarketRegime, TechnicalAnalysisView } from './market';
import type { PairSentiment } from './news';
import type { FeatureVector, ModelSignalPolicy } from './prediction';
import type { RiskAssessment } from './risk';

export type SignalAction = 'LONG' | 'SHORT' | 'WATCH' | 'NO_TRADE';

/** README §15.3 — NO TRADE reasons are machine-readable, not free text. */
export type NoTradeReason =
  | 'LOW_MODEL_CONFIDENCE'
  | 'CONFLICTING_INDICATORS'
  | 'POOR_RISK_REWARD'
  | 'EXTREME_VOLATILITY'
  | 'STALE_MARKET_DATA'
  | 'INSUFFICIENT_HISTORICAL_EVIDENCE'
  | 'HIGH_IMPACT_EVENT'
  | 'INSUFFICIENT_DATA'
  | 'MODEL_DISAGREEMENT'
  | 'UNUSUAL_MARKET_REGIME';

/** README §15.1 — weights are configuration, never hard-coded constants. */
export interface DecisionWeights {
  technical: number;
  historical: number;
  ml: number;
  news: number;
  regime: number;
  risk: number;
}

export type SignalComponent = keyof DecisionWeights;

/** README §15.2 score bands. */
export interface SignalScoreBand {
  min: number;
  max: number;
  label: string;
}

/** A structured claim that P17 is allowed to narrate but never invent from. */
export interface EvidenceItem {
  source: string;
  claim: string;
  value: string | number | boolean | null;
}

/**
 * Persisted scores JSON. The six weights remain the stable contract; the
 * optional fields carry the traceable component scores, band and evidence
 * snapshot that P17/P24 consume.
 */
export interface SignalScores extends DecisionWeights {
  components?: Record<SignalComponent, number>;
  weightsVersion?: string;
  band?: string;
  modelVersion?: string;
  dataFreshnessSeconds?: number;
  supportingEvidence?: EvidenceItem[];
  contradictingEvidence?: EvidenceItem[];
}

export interface TradeSignal {
  id: string;
  symbol: string;
  action: SignalAction;
  direction: Direction;
  score: number;
  probability: number;
  confidence: number;
  riskLevel: RiskLevel;
  scores: SignalScores;
  reasons: string[];
  noTradeReasons: NoTradeReason[];
  generatedAt: string;
  regime?: MarketRegime;
  band?: string;
  componentScores?: Record<SignalComponent, number>;
  weightsVersion?: string;
  modelVersion?: string;
  dataFreshnessSeconds?: number;
  volatilityPct?: number;
  supportingEvidence?: EvidenceItem[];
  contradictingEvidence?: EvidenceItem[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
}

export interface ScannerRow {
  symbol: string;
  action: SignalAction;
  score: number;
  probability: number;
  riskLevel: RiskLevel;
  volatility?: number;
  confidence?: number;
  band?: string;
  regime?: MarketRegime;
  noTradeReasons?: NoTradeReason[];
  reasons?: string[];
}

/** Pure engine input: every number is already normalised by a P08–P15 provider. */
export interface DecisionEvidenceBundle {
  symbol: string;
  asOf: string;
  timeframe: Timeframe;
  weights: DecisionWeights;
  weightsVersion: string;
  technical?: TechnicalAnalysisView | null;
  historical?: HistoricalAnalysisView | null;
  prediction?: PredictResponse | null;
  modelStatus?: 'ACTIVE' | 'TRAINING' | 'ARCHIVED' | 'DRIFT_WARNING';
  signalPolicy?: ModelSignalPolicy;
  news?: PairSentiment | null;
  risk?: RiskAssessment | null;
  featureVector?: FeatureVector | null;
  imminentEvents?: readonly {
    eventName: string;
    currency: string;
    minutesUntil?: number;
  }[];
  dataFreshnessSeconds?: number;
  /** Hypothetical geometry given to P15; P25/P26 must still re-validate it. */
  order?: { entry: number; stopLoss: number; takeProfit: number; size: number };
}

export interface DecisionResult {
  score: number;
  band: string;
  action: SignalAction;
  direction: Direction;
  probability: number;
  confidence: number;
  riskLevel: RiskLevel;
  scores: SignalScores;
  componentScores: Record<SignalComponent, number>;
  reasons: string[];
  noTradeReasons: NoTradeReason[];
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  modelVersion?: string;
  dataFreshnessSeconds?: number;
  volatilityPct?: number;
  regime?: MarketRegime;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
}
