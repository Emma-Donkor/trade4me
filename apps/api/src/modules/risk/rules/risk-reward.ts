import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';
import { riskReward } from '../sizing.service';

export const riskRewardRule: RiskRule = {
  code: 'MIN_RISK_REWARD',
  evaluate(context) {
    const minimum = Math.min(context.profile.minRiskReward, 10);
    const actual = riskReward(context);
    // Floating-point price arithmetic can land a fraction below the boundary.
    if (actual < minimum - 1e-9) {
      return verdict(
        'MIN_RISK_REWARD',
        'BLOCK',
        `Risk/reward ${actual.toFixed(2)} is below the ${minimum.toFixed(2)} minimum`,
      );
    }
    if (actual < minimum + 0.2) {
      return verdict(
        'MIN_RISK_REWARD',
        'WARN',
        `Risk/reward ${actual.toFixed(2)} is close to the ${minimum.toFixed(2)} minimum`,
      );
    }
    return verdict('MIN_RISK_REWARD', 'PASS', `Risk/reward ${actual.toFixed(2)} meets the minimum`);
  },
};
