import { RISK_HARD_CAPS } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

/** Drawdown is tracked from the portfolio's high-water mark, not its balance. */
export const drawdownRule: RiskRule = {
  code: 'MAX_DRAWDOWN',
  evaluate(context) {
    const cap = Math.min(context.profile.maxDrawdownPct, RISK_HARD_CAPS.maxDrawdownPct);
    if (context.drawdownPct > cap) {
      return verdict(
        'MAX_DRAWDOWN',
        'BLOCK',
        `Drawdown ${context.drawdownPct.toFixed(2)}% exceeds the ${cap}% limit`,
      );
    }
    if (context.drawdownPct > cap * 0.8) {
      return verdict(
        'MAX_DRAWDOWN',
        'WARN',
        `Drawdown ${context.drawdownPct.toFixed(2)}% is approaching the ${cap}% limit`,
      );
    }
    return verdict('MAX_DRAWDOWN', 'PASS', `Drawdown is below the ${cap}% limit`);
  },
};
