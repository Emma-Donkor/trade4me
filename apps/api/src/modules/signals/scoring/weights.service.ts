import { Injectable } from '@nestjs/common';
import { DECISION_WEIGHTS_VERSION } from '@ts/config';
import type { DecisionWeights } from '@ts/types';
import { compareWeights, resolveWeights } from './weights';

export interface ResolvedWeights {
  weights: DecisionWeights;
  version: string;
}

/**
 * P28/P24 hook. No HTTP route exposes this in P16: the admin and backtest
 * phases inject this provider to compare or install a versioned weight set.
 */
@Injectable()
export class DecisionWeightsService {
  private currentWeights: ResolvedWeights = resolveWeights(undefined, DECISION_WEIGHTS_VERSION);

  current(): ResolvedWeights {
    return { weights: { ...this.currentWeights.weights }, version: this.currentWeights.version };
  }

  configure(
    override: Partial<DecisionWeights>,
    version: string = DECISION_WEIGHTS_VERSION,
  ): ResolvedWeights {
    this.currentWeights = resolveWeights(override, version);
    return this.current();
  }

  compare(left: DecisionWeights, right: DecisionWeights = this.current().weights) {
    return compareWeights(left, right);
  }
}
