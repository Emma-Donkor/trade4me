import { Inject, Injectable, Optional } from '@nestjs/common';
import { env } from '@ts/config';
import type { Candle, MarketQuote, ProviderHealth, Timeframe } from '@ts/types';
import { ProviderError } from './provider.errors';
import {
  MARKET_HTTP_FETCH,
  type Clock,
  type FetchLike,
  type MarketDataProvider,
  type ProviderPairContext,
} from './provider.interface';
import { asRecord, currencyCodes, fetchProviderJson, mappedSymbol } from './http-provider.utils';
import {
  coerceProviderNumber,
  coerceProviderTimestamp,
  normalizeCandle,
  normalizeQuote,
  parseProviderCandles,
  parseProviderQuote,
} from './response-validation';

const BASE_URL = 'https://www.alphavantage.co/query';
const INTRADAY_INTERVAL: Partial<Record<Timeframe, string>> = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  M30: '30min',
  H1: '60min',
};
const DAILY_FUNCTION: Partial<Record<Timeframe, string>> = {
  D1: 'TIME_SERIES_DAILY',
  W1: 'TIME_SERIES_WEEKLY',
  MN1: 'TIME_SERIES_MONTHLY',
};

/** AlphaVantage adapter — the key stays in memory and never in errors/WS. */
@Injectable()
export class AlphaVantageProvider implements MarketDataProvider {
  readonly name = 'alphavantage';
  private readonly apiKey: string;
  private readonly fetcher: FetchLike;
  private readonly clock: Clock;
  private readonly timeoutMs: number;

  constructor(
    @Inject(MARKET_HTTP_FETCH) fetcher: FetchLike,
    @Optional() options: { apiKey?: string; clock?: Clock; timeoutMs?: number } = {},
  ) {
    this.apiKey = options.apiKey ?? String(env.MARKET_API_KEY ?? '');
    this.fetcher = fetcher;
    this.clock = options.clock ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async getQuote(symbol: string, context?: ProviderPairContext): Promise<MarketQuote> {
    this.assertConfigured();
    const { from, to } = currencyCodes(mappedSymbol(symbol, context, this.name));
    const url =
      `${BASE_URL}?function=CURRENCY_EXCHANGE_RATE` +
      `&from_currency=${encodeURIComponent(from)}&to_currency=${encodeURIComponent(to)}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`;
    const raw = await fetchProviderJson(url, {
      fetcher: this.fetcher,
      provider: this.name,
      timeoutMs: this.timeoutMs,
    });
    parseProviderQuote(raw, this.name);
    const rate = asRecord(asRecord(raw)['Realtime Currency Exchange Rate']);
    const price = coerceProviderNumber(rate['5. Exchange Rate']);
    const timestamp = coerceProviderTimestamp(rate['6. Last Refreshed']);
    if (price === undefined || timestamp === undefined) {
      throw new ProviderError('malformed', 'AlphaVantage quote is missing rate or timestamp');
    }
    return normalizeQuote({ price, timestamp }, symbol, this.name, context, this.clock());
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date,
    context?: ProviderPairContext,
  ): Promise<Candle[]> {
    this.assertConfigured();
    if (start.getTime() > end.getTime()) return [];
    const interval = INTRADAY_INTERVAL[timeframe];
    const dailyFunction = DAILY_FUNCTION[timeframe];
    if (!interval && !dailyFunction) {
      throw new ProviderError('unsupported', `AlphaVantage cannot serve ${timeframe} candles`);
    }
    const url = dailyFunction
      ? `${BASE_URL}?function=${dailyFunction}&symbol=${encodeURIComponent(
          mappedSymbol(symbol, context, this.name),
        )}&outputsize=full&apikey=${encodeURIComponent(this.apiKey)}`
      : `${BASE_URL}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(
          mappedSymbol(symbol, context, this.name),
        )}&interval=${interval}&outputsize=full&apikey=${encodeURIComponent(this.apiKey)}`;
    const raw = await fetchProviderJson(url, {
      fetcher: this.fetcher,
      provider: this.name,
      timeoutMs: this.timeoutMs,
    });
    parseProviderQuote(raw, this.name);
    const rows = parseProviderCandles(raw, this.name);
    const candles: Candle[] = [];
    let previous: Date | null = null;
    for (const row of rows.slice(0, 500).reverse()) {
      const candle = normalizeCandle(row, symbol, timeframe, this.name, {
        now: this.clock(),
        previous,
        context,
      });
      previous = new Date(candle.timestamp);
      if (previous >= start && previous <= end) candles.push(candle);
    }
    return candles;
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      name: this.name,
      status: this.apiKey ? 'HEALTHY' : 'DISABLED',
      lastCheckedAt: this.clock().toISOString(),
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new ProviderError('disabled', 'AlphaVantage is disabled: no API key configured');
    }
  }
}
