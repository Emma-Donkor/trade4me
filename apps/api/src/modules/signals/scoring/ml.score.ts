import type { ModelSignalPolicy, PredictResponse } from '@ts/types';
import { clampScore, component, evidence, type ComponentScore } from './component';

/** P14 is the only probability authority; P16 never recomputes it. */
export function scoreMl(
  prediction: PredictResponse | null | undefined,
  policy: ModelSignalPolicy | undefined,
): ComponentScore {
  if (prediction === null || prediction === undefined) {
    return component(
      50,
      [],
      [evidence('ml', 'No promoted model prediction is available', 'missing')],
      ['INSUFFICIENT_DATA'],
      'NEUTRAL',
    );
  }

  const weight = policy?.weight ?? 1;
  const score = clampScore(prediction.probability * 100 * weight);
  const item = evidence(
    'ml',
    `Model ${prediction.modelVersion} predicts ${prediction.direction} with probability ${prediction.probability}`,
    prediction.probability,
  );
  const contradicting = [item];
  if (policy !== undefined && policy.weight < 1) {
    contradicting.push(evidence('ml', policy.reason ?? 'Model is down-weighted', weight));
  }

  return component(
    score,
    prediction.probability >= 0.5 && weight >= 1 ? [item] : [],
    contradicting,
    policy?.block === true ? ['INSUFFICIENT_DATA'] : [],
    prediction.direction,
  );
}
