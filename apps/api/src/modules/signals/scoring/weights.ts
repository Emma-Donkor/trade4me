import {
  DEFAULT_DECISION_WEIGHTS,
  DECISION_WEIGHTS_VERSION,
  assertWeightsSumTo1,
} from '@ts/config';
import type {
  DecisionWeights,
  EvidenceItem,
  MarketRegime,
  SignalComponent,
  SignalScores,
} from '@ts/types';

export const SIGNAL_COMPONENTS: readonly SignalComponent[] = [
  'technical',
  'historical',
  'ml',
  'news',
  'regime',
  'risk',
];

/** Merge, validate and version a configurable weight set before any scoring. */
export function resolveWeights(
  override: Partial<DecisionWeights> | undefined,
  version: string = DECISION_WEIGHTS_VERSION,
): { weights: DecisionWeights; version: string } {
  const weights: DecisionWeights = {
    ...DEFAULT_DECISION_WEIGHTS,
    ...(override ?? {}),
  };
  for (const component of SIGNAL_COMPONENTS) {
    const weight = weights[component];
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error(`Decision weight ${component} must be between 0 and 1`);
    }
  }
  assertWeightsSumTo1(weights);
  return { weights, version };
}

export function combineComponentScores(
  components: Record<SignalComponent, number>,
  weights: DecisionWeights,
): number {
  const total = SIGNAL_COMPONENTS.reduce(
    (sum, component) => sum + components[component] * weights[component],
    0,
  );
  return Math.round(Math.max(0, Math.min(100, total)) * 100) / 100;
}

/** `scores` JSON is the versioned, auditable snapshot persisted with a signal. */
export function snapshotScores(input: {
  weights: DecisionWeights;
  version: string;
  components: Record<SignalComponent, number>;
  band: string;
  marketRegime?: MarketRegime;
  modelVersion?: string;
  dataFreshnessSeconds?: number;
  supportingEvidence?: EvidenceItem[];
  contradictingEvidence?: EvidenceItem[];
}): SignalScores {
  return {
    ...input.weights,
    components: input.components,
    weightsVersion: input.version,
    band: input.band,
    ...(input.marketRegime === undefined ? {} : { regime: input.marketRegime }),
    ...(input.modelVersion === undefined ? {} : { modelVersion: input.modelVersion }),
    ...(input.dataFreshnessSeconds === undefined
      ? {}
      : { dataFreshnessSeconds: input.dataFreshnessSeconds }),
    ...(input.supportingEvidence === undefined
      ? {}
      : { supportingEvidence: input.supportingEvidence }),
    ...(input.contradictingEvidence === undefined
      ? {}
      : { contradictingEvidence: input.contradictingEvidence }),
  } as SignalScores;
}

/** P24/P28 hook: compare two weight experiments without engine changes. */
export function compareWeights(
  left: DecisionWeights,
  right: DecisionWeights,
): Partial<Record<SignalComponent, number>> {
  return Object.fromEntries(
    SIGNAL_COMPONENTS.filter((component) => left[component] !== right[component]).map(
      (component) => [component, Number((right[component] - left[component]).toFixed(6))],
    ),
  );
}
