import {
  calculateSizing,
  dailyLossPct,
  DrawdownTracker,
  exposureByCurrency,
  portfolioExposure,
  positionSize,
  potentialProfit,
  priceMoveValue,
  riskAmount,
  riskReward,
  scalingForSymbol,
  stopDistance,
  stopPips,
} from '../sizing.service';

describe('P15 sizing formulas', () => {
  it('computes the standard-lot example from README §14.2', () => {
    const input = {
      balance: 10_000,
      riskPerTradePct: 1,
      entry: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
      pipSize: 0.0001,
      pointValue: 10,
    };
    expect(riskAmount(input.balance, input.riskPerTradePct)).toBe(100);
    expect(stopDistance(input.entry, input.stopLoss)).toBeCloseTo(0.005, 10);
    expect(stopPips(0.005, input.pipSize)).toBeCloseTo(50, 10);
    expect(positionSize(input)).toBeCloseTo(0.2, 10);
    expect(riskReward(input)).toBeCloseTo(2, 10);
    expect(potentialProfit(0.2, input.entry, input.takeProfit, input)).toBeCloseTo(200, 10);
    expect(calculateSizing(input)).toMatchObject({
      riskAmount: 100,
      positionSize: 0.2,
      riskReward: 2,
      potentialLoss: 100,
    });
  });

  it('scales JPY pairs with a 0.01 pip and their own point value', () => {
    expect(scalingForSymbol('USD/JPY')).toEqual({ pipSize: 0.01, pointValue: 9.09 });
    expect(scalingForSymbol('EUR/JPY')).toEqual({ pipSize: 0.01, pointValue: 9.09 });
    expect(
      positionSize({
        balance: 10_000,
        riskPerTradePct: 1,
        entry: 150,
        stopLoss: 149.5,
        takeProfit: 151,
        ...scalingForSymbol('USD/JPY'),
      }),
    ).toBeCloseTo(100 / (50 * 9.09), 10);
  });

  it('uses cross-pair metadata instead of assuming USD quoting', () => {
    expect(scalingForSymbol('EUR/GBP')).toEqual({ pipSize: 0.0001, pointValue: 10 });
    expect(
      positionSize({
        balance: 20_000,
        riskPerTradePct: 0.5,
        entry: 0.85,
        stopLoss: 0.8475,
        takeProfit: 0.855,
        ...scalingForSymbol('EUR/GBP'),
      }),
    ).toBeCloseTo(100 / (25 * 10), 10);
  });

  it('keeps fractional sizes precise and rounds only at presentation', () => {
    expect(
      positionSize({
        balance: 12_345.67,
        riskPerTradePct: 0.5,
        entry: 1.0842,
        stopLoss: 1.0812,
        takeProfit: 1.0902,
        pipSize: 0.0001,
        pointValue: 10,
      }),
    ).toBeCloseTo(61.72835 / 300, 10);
  });

  it('rejects zero/negative risk, zero distance, and invalid prices', () => {
    expect(() => riskAmount(10_000, 0)).toThrow(/riskPerTradePct/);
    expect(() => riskAmount(10_000, -1)).toThrow(/riskPerTradePct/);
    expect(() => stopDistance(1.1, 1.1)).toThrow(/differ/);
    expect(() => stopDistance(1.1, 0)).toThrow(/stopLoss/);
    expect(() =>
      positionSize({
        balance: 10_000,
        riskPerTradePct: 1,
        entry: -1,
        stopLoss: 1.09,
        takeProfit: 1.11,
        pipSize: 0.0001,
        pointValue: 10,
      }),
    ).toThrow(/entry/);
  });

  it('treats R/R 1.5 as the boundary, not a failure', () => {
    expect(riskReward({ entry: 1.1, stopLoss: 1.095, takeProfit: 1.1075 })).toBeCloseTo(1.5, 10);
    expect(riskReward({ entry: 1.1, stopLoss: 1.095, takeProfit: 1.1074 })).toBeLessThan(1.5);
  });

  it('computes exposure as total notional over equity', () => {
    const positions = [
      { size: 1, entryPrice: 1.1, pipSize: 0.0001, pointValue: 10 },
      { size: 0.5, entryPrice: 1.2, pipSize: 0.0001, pointValue: 10 },
    ];
    expect(priceMoveValue(1, { pipSize: 0.0001, pointValue: 10 })).toBe(100_000);
    expect(portfolioExposure(positions, 100_000)).toBeCloseTo(170, 10);
    expect(
      exposureByCurrency(
        [
          { ...positions[0], currency: 'EUR' },
          { ...positions[1], currency: 'GBP' },
        ],
        100_000,
      ).get('EUR'),
    ).toBeCloseTo(110, 10);
  });

  it('tracks daily loss and the drawdown high-water mark', () => {
    expect(dailyLossPct(10_000, 9_700)).toBeCloseTo(3, 10);
    expect(dailyLossPct(10_000, 10_200)).toBe(0);
    const tracker = new DrawdownTracker(100);
    expect(tracker.record(120)).toEqual({ peak: 120, drawdownPct: 0 });
    expect(tracker.record(108)).toEqual({ peak: 120, drawdownPct: 10 });
    expect(tracker.record(130)).toEqual({ peak: 130, drawdownPct: 0 });
    expect(DrawdownTracker.worst(100, [120, 108, 130, 117])).toBeCloseTo(10, 10);
  });
});
