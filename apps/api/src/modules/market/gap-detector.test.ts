import { describe, expect, it } from '@jest/globals';
import { detectCandleGaps } from './gap-detector';

const base = {
  pairId: 'pair-1',
  symbol: 'EUR/USD',
  timeframe: 'H1' as const,
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-01-01T05:00:00.000Z'),
};

function hours(...values: number[]): Date[] {
  return values.map((hour) => new Date(Date.UTC(2026, 0, 1, hour)));
}

describe('detectCandleGaps', () => {
  it('reports no gaps for a complete series', () => {
    expect(detectCandleGaps({ ...base, timestamps: hours(0, 1, 2, 3, 4, 5) })).toEqual([]);
  });

  it('reports one interior hole with the exact missing bucket count', () => {
    const gaps = detectCandleGaps({ ...base, timestamps: hours(0, 1, 4, 5) });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      from: '2026-01-01T02:00:00.000Z',
      to: '2026-01-01T03:00:00.000Z',
      missing: 2,
    });
  });

  it('reports leading and missing trailing holes separately', () => {
    const gaps = detectCandleGaps({ ...base, timestamps: hours(2, 3) });
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T01:00:00.000Z',
      missing: 2,
    });
    expect(gaps[1]).toMatchObject({
      from: '2026-01-01T04:00:00.000Z',
      to: '2026-01-01T05:00:00.000Z',
      missing: 2,
    });
  });

  it('deduplicates repeated timestamps and ignores invalid values', () => {
    expect(
      detectCandleGaps({
        ...base,
        timestamps: [
          ...hours(0, 0, 1, 2, 3, 4, 5),
          'not-a-date',
          new Date('2026-01-01T09:00:00.000Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('normalizes off-grid timestamps to their bucket and never invents rows', () => {
    const gaps = detectCandleGaps({
      ...base,
      timestamps: hours(0, 1, 2, 3, 4, 5).map((date) => new Date(date.getTime() + 30 * 60_000)),
    });
    expect(gaps).toEqual([]);
    const withHole = detectCandleGaps({
      ...base,
      timestamps: hours(0, 1, 2, 4, 5).map((date) => new Date(date.getTime() + 30 * 60_000)),
    });
    expect(withHole).toHaveLength(1);
    expect(withHole[0]).toMatchObject({
      from: '2026-01-01T03:00:00.000Z',
      to: '2026-01-01T03:00:00.000Z',
      missing: 1,
    });
  });

  it('returns no gaps when the range is empty', () => {
    expect(detectCandleGaps({ ...base, to: base.from, timestamps: hours(0) })).toEqual([]);
  });
});
