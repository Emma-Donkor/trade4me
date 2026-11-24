import type { Candle, MarketQuote, ProviderHealth, Timeframe } from '@ts/types';
import type { ProviderError } from './provider.errors';

/**
 * Per-pair metadata needed to translate a canonical symbol into a provider
 * symbol (README §9.1 `CurrencyPair.providerSymbols`) and to round prices to
 * the pair's own precision. Kept optional so the interface remains callable
 * with just a symbol, exactly as documented in README §9.1.
 */
export interface ProviderPairContext {
  pairId?: string;
  providerSymbols?: Record<string, unknown>;
  pipSize?: number;
  spreadPipsTypical?: number;
  quoteDecimals?: number;
}

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string, context?: ProviderPairContext): Promise<MarketQuote>;
  getCandles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date,
    context?: ProviderPairContext,
  ): Promise<Candle[]>;
  getHealth(): Promise<ProviderHealth>;
}

/** Every adapter failure is typed so failover can distinguish quota/timeouts. */
export type ProviderFailure = ProviderError;

export const MARKET_HTTP_FETCH = Symbol('MARKET_HTTP_FETCH');
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const MARKET_PROVIDERS = Symbol('MARKET_PROVIDERS');

/** Injectable clock keeps seeded mock output and freshness checks testable. */
export type Clock = () => Date;
