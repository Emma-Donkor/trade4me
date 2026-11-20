import { predictResponseSchema, timeframeSchema } from './ai';

describe('@ts/validation AI contracts', () => {
  it('parses a valid prediction response', () => {
    const parsed = predictResponseSchema.parse({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      direction: 'LONG',
      probability: 0.72,
      confidence: 0.81,
      riskLevel: 'MEDIUM',
      modelVersion: 'xgboost-1.0.0',
    });

    expect(parsed.direction).toBe('LONG');
    expect(parsed.probability).toBe(0.72);
  });

  it('rejects unsupported timeframes and directions', () => {
    expect(timeframeSchema.safeParse('M2').success).toBe(false);
    expect(
      predictResponseSchema.safeParse({
        symbol: 'EUR/USD',
        timeframe: 'H1',
        direction: 'BUY',
        probability: 0.72,
        confidence: 0.81,
        riskLevel: 'MEDIUM',
        modelVersion: 'xgboost-1.0.0',
      }).success,
    ).toBe(false);
  });
});
