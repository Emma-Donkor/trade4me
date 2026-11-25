import { RISK_HARD_CAPS } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

export const dailyLossRule: RiskRule = {
  code: 'MAX_DAILY_LOSS',
  evaluate(context) {
    const cap = Math.min(context.profile.maxDailyLossPct, RISK_HARD_CAPS.maxDailyLossPct);
    if (context.dailyLossPct >= cap) {
      return verdict(
        'MAX_DAILY_LOSS',
        'BLOCK',
        `Daily loss ${context.dailyLossPct.toFixed(2)}% reached the ${cap}% limit`,
      );
    }
    if (context.dailyLossPct >= cap * 0.8) {
      return verdict(
        'MAX_DAILY_LOSS',
        'WARN',
        `Daily loss ${context.dailyLossPct.toFixed(2)}% is approaching the ${cap}% limit`,
      );
    }
    return verdict('MAX_DAILY_LOSS', 'PASS', `Daily loss is below the ${cap}% limit`);
  },
};
