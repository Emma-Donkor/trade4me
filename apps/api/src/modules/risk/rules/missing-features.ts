import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

/** P12's manifest is the authority on which features a decision needs. */
export const missingFeaturesRule: RiskRule = {
  code: 'MISSING_FEATURES',
  evaluate(context) {
    if (context.missingFeatures.length === 0) {
      return verdict('MISSING_FEATURES', 'PASS', 'All required features are present');
    }
    return verdict(
      'MISSING_FEATURES',
      'BLOCK',
      `Required features missing: ${context.missingFeatures.join(', ')}`,
    );
  },
};
