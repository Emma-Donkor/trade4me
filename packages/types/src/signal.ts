import type { Direction, RiskLevel } from './contracts';
import type { MarketRegime } from './market';

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

/** README §15.2 score bands. */
export interface SignalScoreBand {
  min: number;
  max: number;
  label: string;
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
  scores: DecisionWeights;
  reasons: string[];
  noTradeReasons: NoTradeReason[];
  generatedAt: string;
  regime?: MarketRegime;
}

export interface ScannerRow {
  symbol: string;
  action: SignalAction;
  score: number;
  probability: number;
  riskLevel: RiskLevel;
  volatility?: number;
}
