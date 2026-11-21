import type { Timeframe } from './contracts';

export type OrderSide = 'LONG' | 'SHORT';

/** README §16.1 — a backtest request is configuration, not a result. */
export interface BacktestConfig {
  symbol: string;
  strategy: string;
  timeframe: Timeframe;
  rangeStart: string;
  rangeEnd: string;
  startingCapital: number;
  riskPerTradePct: number;
  spreadPips?: number;
  slippagePips?: number;
}

/** README §16.3 tracked metrics; always rendered as historical simulation. */
export interface BacktestResult {
  trades: number;
  wins: number;
  losses: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino?: number;
  expectancy?: number;
  averageWin?: number;
  averageLoss?: number;
  equityCurve: Array<{ timestamp: string; equity: number }>;
}

/** Paper order input validated by the risk engine before any simulated fill. */
export interface PaperOrder {
  symbol: string;
  side: OrderSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
}
