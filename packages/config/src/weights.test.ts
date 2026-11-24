import { describe, expect, it } from '@jest/globals';
import { assertWeightsSumTo1, DEFAULT_DECISION_WEIGHTS, TECHNICAL_SUBWEIGHTS } from './weights';

describe('@ts/config decision weights', () => {
  it('sums the default weights to 1', () => {
    const sum = Object.values(DEFAULT_DECISION_WEIGHTS).reduce(
      (total, weight) => total + weight,
      0,
    );

    expect(sum).toBeCloseTo(1, 10);
    expect(() => assertWeightsSumTo1(DEFAULT_DECISION_WEIGHTS)).not.toThrow();
  });

  it('keeps technical sub-weights normalised', () => {
    const sum = Object.values(TECHNICAL_SUBWEIGHTS).reduce((total, weight) => total + weight, 0);

    expect(sum).toBeCloseTo(1, 10);
  });

  it('rejects a weight set that does not sum to 1', () => {
    expect(() => assertWeightsSumTo1({ ...DEFAULT_DECISION_WEIGHTS, technical: 0.5 })).toThrow(
      'Decision weights must sum to 1',
    );
  });
});
