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
import { asRecord, fetchProviderJson, mappedSymbol } from './http-provider.utils';
import {
  coerceProviderNumber,
  coerceProviderTimestamp,
  normalizeCandle,
  normalizeQuote,
  parseProviderCandles,
  parseProviderQuote,
} from './response-validation';

const BASE_URL = 'https://api.twelvedata.com';
const INTERVALS: Record<Timeframe, string> = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  M30: '30min',
  H1: '1h',
  H4: '4h',
  D1: '1day',
  W1: '1week',
  MN1: '1month',
};

const withSlash = (value: string): string =>
  value.includes('/') || value.length !== 6 ? value : `${value.slice(0, 3)}/${value.slice(3)}`;

/** TwelveData adapter — keys are in process memory only. */
@Injectable()
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'twelvedata';
  private readonly apiKey: string;
  private readonly fetcher: FetchLike;
  private readonly clock: Clock;
  private readonly timeoutMs: number;

  constructor(
    @Inject(MARKET_HTTP_FETCH) fetcher: FetchLike,
    @Optional() options: { apiKey?: string; clock?: Clock; timeoutMs?: number } = {},
  ) {
    this.apiKey = options.apiKey ?? String(env.MARKET_BACKUP_API_KEY ?? '');
    this.fetcher = fetcher;
    this.clock = options.clock ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async getQuote(symbol: string, context?: ProviderPairContext): Promise<MarketQuote> {
    this.assertConfigured();
    const mapped = mappedSymbol(symbol, context, this.name, withSlash);
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(mapped)}&apikey=${encodeURIComponent(this.apiKey)}`;
    const raw = await fetchProviderJson(url, {
      fetcher: this.fetcher,
      provider: this.name,
      timeoutMs: this.timeoutMs,
    });
    parseProviderQuote(raw, this.name);
    const quote = asRecord(raw);
    const price =
      coerceProviderNumber(quote.bid) ??
      coerceProviderNumber(quote.close) ??
      coerceProviderNumber(quote.price);
    if (price === undefined) {
      throw new ProviderError('malformed', 'TwelveData quote is missing a price');
    }
    return normalizeQuote(
      {
        bid: price,
        ask: coerceProviderNumber(quote.ask),
        timestamp: coerceProviderTimestamp(quote.timestamp ?? quote.datetime),
      },
      symbol,
      this.name,
      context,
      this.clock(),
    );
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
    const mapped = mappedSymbol(symbol, context, this.name, withSlash);
    const url =
      `${BASE_URL}/time_series?symbol=${encodeURIComponent(mapped)}` +
      `&interval=${INTERVALS[timeframe]}&start_date=${encodeURIComponent(start.toISOString())}` +
      `&end_date=${encodeURIComponent(end.toISOString())}&apikey=${encodeURIComponent(this.apiKey)}`;
    const raw = await fetchProviderJson(url, {
      fetcher: this.fetcher,
      provider: this.name,
      timeoutMs: this.timeoutMs,
    });
    const record = asRecord(raw);
    if (record.status === 'error') {
      const kind = record.code === 429 ? 'quota' : 'malformed';
      throw new ProviderError(kind, 'TwelveData reported an error payload', {
        details: { code: record.code },
      });
    }
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
      throw new ProviderError('disabled', 'TwelveData is disabled: no backup API key configured');
    }
  }
}
