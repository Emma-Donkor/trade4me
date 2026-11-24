import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FetchLike } from './provider.interface';
import { AlphaVantageProvider } from './alphavantage.provider';
import { TwelveDataProvider } from './twelvedata.provider';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const CONTEXT = { pipSize: 0.0001, spreadPipsTypical: 1, quoteDecimals: 5 };

function fixture(provider: 'alphavantage' | 'twelvedata', name: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/providers/${provider}/${name}.json`),
      'utf8',
    ),
  ) as unknown;
}

function fetcherFor(payload: unknown): { fetcher: FetchLike; mock: jest.Mock } {
  const mock = jest.fn(
    async () => ({ ok: true, status: 200, json: async () => payload }) as Response,
  );
  return { fetcher: mock as unknown as FetchLike, mock };
}

function kindOf(action: () => Promise<unknown>): Promise<string> {
  return action().then(
    () => 'ok',
    (error: unknown) => String((error as { kind?: string }).kind),
  );
}

describe('HTTP provider adapters', () => {
  it('parses AlphaVantage quotes and maps symbol metadata', async () => {
    const { fetcher, mock } = fetcherFor(fixture('alphavantage', 'quote'));
    const provider = new AlphaVantageProvider(fetcher, { apiKey: 'unit-key', clock: () => NOW });
    const quote = await provider.getQuote('EUR/USD', {
      ...CONTEXT,
      providerSymbols: { alphavantage: 'EURUSD' },
    });
    expect(quote).toMatchObject({ symbol: 'EUR/USD', bid: 1.08495, provider: 'alphavantage' });
    const url = String(mock.mock.calls[0][0]);
    expect(url).toContain('from_currency=EUR&to_currency=USD');
    expect(url).toContain('apikey=unit-key');
  });

  it('classifies AlphaVantage quota and malformed payloads', async () => {
    const quota = new AlphaVantageProvider(fetcherFor(fixture('alphavantage', 'quota')).fetcher, {
      apiKey: 'unit-key',
      clock: () => NOW,
    });
    expect(await kindOf(() => quota.getQuote('EUR/USD', CONTEXT))).toBe('quota');

    const broken = new AlphaVantageProvider(fetcherFor({ 'Error Message': 'bad symbol' }).fetcher, {
      apiKey: 'unit-key',
      clock: () => NOW,
    });
    expect(await kindOf(() => broken.getQuote('EUR/USD', CONTEXT))).toBe('malformed');
  });

  it('maps HTTP 429 and timeouts to the documented taxonomy', async () => {
    const limitedFetch = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValue({ ok: false, status: 429 } as Response);
    const limited = new AlphaVantageProvider(limitedFetch as unknown as FetchLike, {
      apiKey: 'unit-key',
      clock: () => NOW,
    });
    expect(await kindOf(() => limited.getQuote('EUR/USD', CONTEXT))).toBe('quota');

    const timeoutFetch = jest
      .fn<() => Promise<Response>>()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    const timeout = new AlphaVantageProvider(timeoutFetch as unknown as FetchLike, {
      apiKey: 'unit-key',
      clock: () => NOW,
    });
    expect(await kindOf(() => timeout.getQuote('EUR/USD', CONTEXT))).toBe('timeout');
  });

  it('parses AlphaVantage OHLC series', async () => {
    const provider = new AlphaVantageProvider(
      fetcherFor(fixture('alphavantage', 'candles')).fetcher,
      {
        apiKey: 'unit-key',
        clock: () => NOW,
      },
    );
    const candles = await provider.getCandles(
      'EUR/USD',
      'H1',
      new Date('2026-11-24T10:00:00Z'),
      new Date('2026-11-24T12:00:00Z'),
      CONTEXT,
    );
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ open: 1.084, high: 1.086, low: 1.0835, close: 1.085 });
  });

  it('parses TwelveData quotes, including epoch-second timestamps', async () => {
    const { fetcher, mock } = fetcherFor(fixture('twelvedata', 'quote'));
    const provider = new TwelveDataProvider(fetcher, { apiKey: 'unit-key', clock: () => NOW });
    const quote = await provider.getQuote('EUR/USD', {
      ...CONTEXT,
      providerSymbols: { twelvedata: 'EURUSD' },
    });
    expect(quote).toMatchObject({ bid: 1.0849, ask: 1.0851, provider: 'twelvedata' });
    expect(String(mock.mock.calls[0][0])).toContain('symbol=EUR%2FUSD');
  });

  it('classifies TwelveData quota payloads and parses its candle series', async () => {
    const limited = new TwelveDataProvider(fetcherFor(fixture('twelvedata', 'quota')).fetcher, {
      apiKey: 'unit-key',
      clock: () => NOW,
    });
    expect(await kindOf(() => limited.getQuote('EUR/USD', CONTEXT))).toBe('quota');

    const provider = new TwelveDataProvider(fetcherFor(fixture('twelvedata', 'candles')).fetcher, {
      apiKey: 'unit-key',
      clock: () => NOW,
    });
    const candles = await provider.getCandles(
      'EUR/USD',
      'H1',
      new Date('2026-11-24T10:00:00Z'),
      new Date('2026-11-24T12:00:00Z'),
      CONTEXT,
    );
    expect(candles).toHaveLength(2);
    expect(candles[1]).toMatchObject({ open: 1.085, close: 1.086, volume: 120 });
  });

  it('does not call the network for unconfigured adapters', async () => {
    const { fetcher, mock } = fetcherFor({});
    const provider = new TwelveDataProvider(fetcher, { apiKey: '', clock: () => NOW });
    expect(await kindOf(() => provider.getQuote('EUR/USD', CONTEXT))).toBe('disabled');
    expect(mock).not.toHaveBeenCalled();
  });
});
