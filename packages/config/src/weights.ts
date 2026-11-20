export interface DecisionWeights {
  technical: number;
  historical: number;
  ml: number;
  news: number;
  regime: number;
  risk: number;
}

export const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  technical: 0.25,
  historical: 0.2,
  ml: 0.25,
  news: 0.1,
  regime: 0.1,
  risk: 0.1,
};

/** Rejects weight sets that do not total 1 (within floating-point tolerance). */
export function assertWeightsSumTo1(weights: DecisionWeights): void {
  const sum = Object.values(weights).reduce((total, weight) => total + weight, 0);

  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`Decision weights must sum to 1, received ${sum}`);
  }
}
