import { DEFAULT_PIP_SIZE, DEFAULT_POINT_VALUE, JPY_PIP_SIZE, JPY_POINT_VALUE } from '@ts/config';

/** Pip/value scaling for one standard lot, from pair metadata (README §14.2). */
export interface PairScaling {
  pipSize: number;
  pointValue: number;
}

export interface SizingInput extends PairScaling {
  balance: number;
  riskPerTradePct: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
}

export interface SizingResult {
  riskAmount: number;
  stopDistance: number;
  stopPips: number;
  positionSize: number;
  potentialProfit: number;
  potentialLoss: number;
  riskReward: number;
}

export interface ExposurePosition {
  size: number;
  entryPrice: number;
  pipSize?: number;
  pointValue?: number;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than zero`);
  }
  return value;
}

function price(value: number, name: string): number {
  return positive(value, name);
}

/** P13/P15: balance × risk%. Rejects impossible inputs rather than sizing zero. */
export function riskAmount(balance: number, riskPerTradePct: number): number {
  positive(balance, 'balance');
  if (!Number.isFinite(riskPerTradePct) || riskPerTradePct <= 0 || riskPerTradePct > 100) {
    throw new Error('riskPerTradePct must be greater than zero and at most 100');
  }
  return (balance * riskPerTradePct) / 100;
}

/** Always absolute: a stop on either side of entry has the same distance. */
export function stopDistance(entry: number, stopLoss: number): number {
  price(entry, 'entry');
  price(stopLoss, 'stopLoss');
  const distance = Math.abs(entry - stopLoss);
  if (distance === 0) throw new Error('stopLoss must differ from entry');
  return distance;
}

export function stopPips(distance: number, pipSize: number): number {
  return positive(distance, 'stopDistance') / positive(pipSize, 'pipSize');
}

/** Default scaling. JPY quotes use a 0.01 pip; every other seeded pair 0.0001. */
export function scalingForSymbol(symbol: string): PairScaling {
  const upper = symbol.toUpperCase();
  return upper.includes('/JPY')
    ? { pipSize: JPY_PIP_SIZE, pointValue: JPY_POINT_VALUE }
    : { pipSize: DEFAULT_PIP_SIZE, pointValue: DEFAULT_POINT_VALUE };
}

/**
 * Lots = risk budget / (stop pips × value per pip per lot). This is the README
 * `riskAmount / stopDistance` rule with explicit point-value scaling, and it
 * works unchanged for JPY and cross pairs because pipSize/pointValue come from
 * pair metadata.
 */
export function positionSize(input: SizingInput): number {
  const budget = riskAmount(input.balance, input.riskPerTradePct);
  const pips = stopPips(stopDistance(input.entry, input.stopLoss), input.pipSize);
  return budget / (pips * positive(input.pointValue, 'pointValue'));
}

export function riskReward(input: { entry: number; stopLoss: number; takeProfit: number }): number {
  const distance = stopDistance(input.entry, input.stopLoss);
  return Math.abs(price(input.takeProfit, 'takeProfit') - input.entry) / distance;
}

/** Account-currency value of a full price-unit move for `lots` standard lots. */
export function priceMoveValue(lots: number, scaling: PairScaling): number {
  return (
    positive(lots, 'positionSize') *
    (positive(scaling.pointValue, 'pointValue') / positive(scaling.pipSize, 'pipSize'))
  );
}

export function potentialProfit(
  lots: number,
  entry: number,
  takeProfit: number,
  scaling: PairScaling,
): number {
  return (
    priceMoveValue(lots, scaling) *
    Math.abs(price(takeProfit, 'takeProfit') - price(entry, 'entry'))
  );
}

/** Assumes the stop is respected — the maximum planned loss is the risk budget. */
export function potentialLoss(balance: number, riskPerTradePct: number): number {
  return riskAmount(balance, riskPerTradePct);
}

/** Eight decimals is the precision of the persisted sizing/price fields. */
function round(value: number): number {
  return Number(value.toFixed(8));
}

export function calculateSizing(input: SizingInput): SizingResult {
  const distance = stopDistance(input.entry, input.stopLoss);
  const lots = positionSize(input);
  const rr = riskReward(input);
  const loss = riskAmount(input.balance, input.riskPerTradePct);
  return {
    riskAmount: round(loss),
    stopDistance: round(distance),
    stopPips: round(stopPips(distance, input.pipSize)),
    positionSize: round(lots),
    potentialProfit: round(potentialProfit(lots, input.entry, input.takeProfit, input)),
    potentialLoss: round(loss),
    riskReward: round(rr),
  };
}

/** Σ notional / equity × 100. `size` is in standard lots. */
export function portfolioExposure(positions: readonly ExposurePosition[], equity: number): number {
  positive(equity, 'equity');
  const notional = positions.reduce((total, position) => {
    const scaling: PairScaling = {
      pipSize: position.pipSize ?? DEFAULT_PIP_SIZE,
      pointValue: position.pointValue ?? DEFAULT_POINT_VALUE,
    };
    return (
      total + priceMoveValue(position.size, scaling) * price(position.entryPrice, 'entryPrice')
    );
  }, 0);
  return (notional / equity) * 100;
}

/** Group exposure by currency for the portfolio analyzer. */
export function exposureByCurrency(
  positions: readonly (ExposurePosition & { currency: string })[],
  equity: number,
): Map<string, number> {
  const grouped = new Map<string, ExposurePosition[]>();
  for (const position of positions) {
    const bucket = grouped.get(position.currency) ?? [];
    bucket.push(position);
    grouped.set(position.currency, bucket);
  }
  const result = new Map<string, number>();
  for (const [currency, bucket] of grouped) {
    result.set(currency, portfolioExposure(bucket, equity));
  }
  return result;
}

/** Daily realised loss as a percentage of the start-of-day balance. */
export function dailyLossPct(startOfDayEquity: number, currentEquity: number): number {
  const start = positive(startOfDayEquity, 'startOfDayEquity');
  positive(currentEquity, 'currentEquity');
  return Math.max(0, ((start - currentEquity) / start) * 100);
}

/** Tracks the high-water mark across an equity sequence (drawdown state machine). */
export class DrawdownTracker {
  private peak: number;

  constructor(initialEquity: number) {
    this.peak = positive(initialEquity, 'initialEquity');
  }

  get highWaterMark(): number {
    return this.peak;
  }

  record(equity: number): { peak: number; drawdownPct: number } {
    positive(equity, 'equity');
    this.peak = Math.max(this.peak, equity);
    return {
      peak: this.peak,
      drawdownPct: Math.max(0, ((this.peak - equity) / this.peak) * 100),
    };
  }

  /** Replay an equity curve and return the worst observed drawdown. */
  static worst(initialEquity: number, sequence: readonly number[]): number {
    const tracker = new DrawdownTracker(initialEquity);
    return sequence.reduce(
      (worst, equity) => Math.max(worst, tracker.record(equity).drawdownPct),
      0,
    );
  }
}
