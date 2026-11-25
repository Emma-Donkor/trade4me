import { MIN_RISK_CONFIDENCE, MIN_RISK_CONFIDENCE_WARN } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

/** P14's calibrated probability confidence gates P15/P16 trust. */
export const confidenceRule: RiskRule = {
  code: 'MIN_CONFIDENCE',
  evaluate(context) {
    if (context.confidence === undefined) {
      return verdict('MIN_CONFIDENCE', 'PASS', 'No model confidence supplied for this order');
    }
    if (context.confidence < MIN_RISK_CONFIDENCE) {
      return verdict(
        'MIN_CONFIDENCE',
        'BLOCK',
        `Model confidence ${context.confidence.toFixed(2)} is below the ${MIN_RISK_CONFIDENCE} minimum`,
      );
    }
    if (context.confidence < MIN_RISK_CONFIDENCE_WARN) {
      return verdict(
        'MIN_CONFIDENCE',
        'WARN',
        `Model confidence ${context.confidence.toFixed(2)} is below the preferred ${MIN_RISK_CONFIDENCE_WARN}`,
      );
    }
    return verdict(
      'MIN_CONFIDENCE',
      'PASS',
      `Model confidence ${context.confidence.toFixed(2)} is sufficient`,
    );
  },
};
