export type PositionStatus = 'OPEN' | 'CLOSED' | 'STOPPED_OUT' | 'TAKE_PROFIT';

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: PositionStatus;
  entryPrice: number;
  size: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  unrealizedPnl?: number;
  realizedPnl?: number;
  openedAt: string;
  closedAt?: string | null;
}

export interface PortfolioSummary {
  id: string;
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  drawdownPct: number;
  winRate: number;
  profitFactor: number;
  exposurePct: number;
  positions: Position[];
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  sortOrder: number;
  alerts?: {
    priceAbove?: number;
    priceBelow?: number;
    scoreAbove?: number;
  };
}

export interface CurrencyExposure {
  currency: string;
  notional: number;
  exposurePct: number;
  warning: 'LOW' | 'MEDIUM' | 'HIGH';
}
