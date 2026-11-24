import { describe, expect, it } from '@jest/globals';
import { ProviderError, type ProviderErrorKind } from './provider.errors';
import { assertValidTimestamp, normalizeCandle, normalizeQuote } from './response-validation';

const NOW = new Date('2026-11-24T12:00:00.000Z');

function failureKind(action: () => unknown): ProviderErrorKind {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    return (error as ProviderError).kind;
  }
  throw new Error('Expected provider validation to fail');
}

describe('provider response validation', () => {
  it('normalizes numeric strings and derives spread from pair metadata', () => {
    const quote = normalizeQuote(
      { bid: '1.08490', timestamp: '2026-11-24T11:59:58Z' },
      'EUR/USD',
      'alphavantage',
      { pipSize: 0.0001, spreadPipsTypical: 1, quoteDecimals: 5 },
      NOW,
    );
    expect(quote).toEqual({
      symbol: 'EUR/USD',
      bid: 1.0849,
      ask: 1.085,
      spread: 0.0001,
      timestamp: '2026-11-24T11:59:58.000Z',
      provider: 'alphavantage',
    });
  });

  it('respects JPY pair precision and rejects over-precise prices', () => {
    const quote = normalizeQuote(
      { bid: '148.500', ask: 148.512, timestamp: '2026-11-24T11:59:58Z' },
      'USD/JPY',
      'mock',
      { pipSize: 0.01, quoteDecimals: 3 },
      NOW,
    );
    expect(quote.bid).toBe(148.5);
    expect(quote.ask).toBe(148.512);
    expect(
      failureKind(() =>
        normalizeQuote(
          { bid: 148.50001, timestamp: '2026-11-24T11:59:58Z' },
          'USD/JPY',
          'mock',
          { pipSize: 0.01, quoteDecimals: 3 },
          NOW,
        ),
      ),
    ).toBe('malformed');
  });

  it('rejects NaN, negative prices and inconsistent spreads', () => {
    const context = { pipSize: 0.0001, quoteDecimals: 5 };
    expect(
      failureKind(() =>
        normalizeQuote(
          { bid: Number.NaN, timestamp: '2026-11-24T11:59:58Z' },
          'EUR/USD',
          'mock',
          context,
          NOW,
        ),
      ),
    ).toBe('malformed');
    expect(
      failureKind(() =>
        normalizeQuote(
          { bid: -1.08, timestamp: '2026-11-24T11:59:58Z' },
          'EUR/USD',
          'mock',
          context,
          NOW,
        ),
      ),
    ).toBe('malformed');
    expect(
      failureKind(() =>
        normalizeQuote(
          { bid: 1.08, ask: 1.09, spread: 0.05, timestamp: '2026-11-24T11:59:58Z' },
          'EUR/USD',
          'mock',
          context,
          NOW,
        ),
      ),
    ).toBe('malformed');
  });

  it('rejects OHLC rows with high < low, NaN and negative prices', () => {
    const base = { timestamp: '2026-11-24T11:00:00Z', volume: 0 };
    expect(
      failureKind(() =>
        normalizeCandle(
          { ...base, open: 1.08, high: 1.07, low: 1.09, close: 1.08 },
          'EUR/USD',
          'H1',
          'mock',
          { now: NOW },
        ),
      ),
    ).toBe('malformed');
    expect(
      failureKind(() =>
        normalizeCandle(
          { ...base, open: Number.NaN, high: 1.09, low: 1.07, close: 1.08 },
          'EUR/USD',
          'H1',
          'mock',
          { now: NOW },
        ),
      ),
    ).toBe('malformed');
    expect(
      failureKind(() =>
        normalizeCandle(
          { ...base, open: -1.08, high: 1.09, low: 1.07, close: 1.08 },
          'EUR/USD',
          'H1',
          'mock',
          { now: NOW },
        ),
      ),
    ).toBe('malformed');
    const valid = normalizeCandle(
      {
        timestamp: '2026-11-24T11:00:00Z',
        '1. open': '1.0840',
        '2. high': '1.0860',
        '3. low': '1.0835',
        '4. close': '1.0850',
      },
      'EUR/USD',
      'H1',
      'alphavantage',
      { now: NOW },
    );
    expect(valid).toMatchObject({ open: 1.084, high: 1.086, low: 1.0835, close: 1.085 });
  });

  it('rejects future and out-of-order timestamps', () => {
    const provider = 'mock';
    expect(
      failureKind(() => assertValidTimestamp('2026-11-24T13:00:00Z', { provider, now: NOW })),
    ).toBe('invalid_timestamp');
    expect(
      failureKind(() =>
        assertValidTimestamp('2026-11-24T11:59:59Z', {
          provider,
          now: NOW,
          previous: '2026-11-24T12:00:00Z',
        }),
      ),
    ).toBe('invalid_timestamp');
    expect(
      assertValidTimestamp('2026-11-24T12:00:01Z', {
        provider,
        now: NOW,
        previous: '2026-11-24T12:00:00Z',
      }).toISOString(),
    ).toBe('2026-11-24T12:00:01.000Z');
  });
});
