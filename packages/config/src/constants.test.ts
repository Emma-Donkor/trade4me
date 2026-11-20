import { HEALTH_CHECK_TIMEOUT_MS, SCORE_BANDS, TIMEFRAMES, type Timeframe } from './constants';

function bandFor(score: number): string | undefined {
  return SCORE_BANDS.find((band) => score >= band.min && score <= band.max)?.label;
}

describe('@ts/config constants', () => {
  it('exposes the supported timeframes in order', () => {
    const expected: readonly Timeframe[] = [
      'M1',
      'M5',
      'M15',
      'M30',
      'H1',
      'H4',
      'D1',
      'W1',
      'MN1',
    ];

    expect(TIMEFRAMES).toEqual(expected);
  });

  it('maps every score band boundary to the expected label', () => {
    expect(bandFor(100)).toBe('Strong setup');
    expect(bandFor(80)).toBe('Strong setup');
    expect(bandFor(79)).toBe('Good setup');
    expect(bandFor(70)).toBe('Good setup');
    expect(bandFor(69)).toBe('Watch');
    expect(bandFor(60)).toBe('Watch');
    expect(bandFor(59)).toBe('Weak');
    expect(bandFor(50)).toBe('Weak');
    expect(bandFor(49)).toBe('Avoid');
    expect(bandFor(0)).toBe('Avoid');
    expect(bandFor(-1)).toBeUndefined();
    expect(bandFor(101)).toBeUndefined();
  });

  it('uses a two-second health check timeout', () => {
    expect(HEALTH_CHECK_TIMEOUT_MS).toBe(2000);
  });
});
