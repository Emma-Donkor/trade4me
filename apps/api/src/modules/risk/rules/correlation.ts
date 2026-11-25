import { MAX_CORRELATED_EXPOSURE_PCT } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

/** Same-currency/correlated bucket exposure is capped independently. */
export const correlationRule: RiskRule = {
  code: 'MAX_CORRELATED_EXPOSURE',
  evaluate(context) {
    if (context.correlatedExposurePct > MAX_CORRELATED_EXPOSURE_PCT) {
      return verdict(
        'MAX_CORRELATED_EXPOSURE',
        'BLOCK',
        `Correlated exposure ${context.correlatedExposurePct.toFixed(2)}% exceeds the ${MAX_CORRELATED_EXPOSURE_PCT}% limit`,
      );
    }
    if (context.correlatedExposurePct > MAX_CORRELATED_EXPOSURE_PCT * 0.8) {
      return verdict(
        'MAX_CORRELATED_EXPOSURE',
        'WARN',
        `Correlated exposure ${context.correlatedExposurePct.toFixed(2)}% is concentrated`,
      );
    }
    return verdict(
      'MAX_CORRELATED_EXPOSURE',
      'PASS',
      `Correlated exposure is below the ${MAX_CORRELATED_EXPOSURE_PCT}% limit`,
    );
  },
};
