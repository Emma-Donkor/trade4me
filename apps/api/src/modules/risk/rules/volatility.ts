import { RISK_HARD_CAPS } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

export const volatilityRule: RiskRule = {
  code: 'MAX_VOLATILITY',
  evaluate(context) {
    if (context.volatilityPct === undefined) {
      return verdict('MAX_VOLATILITY', 'PASS', 'No volatility input supplied for this order');
    }
    const cap = Math.min(context.profile.maxVolatilityPct, RISK_HARD_CAPS.maxVolatilityPct);
    if (context.volatilityPct > cap) {
      return verdict(
        'MAX_VOLATILITY',
        'BLOCK',
        `Volatility ${context.volatilityPct.toFixed(2)}% exceeds the ${cap}% limit`,
      );
    }
    if (context.volatilityPct > cap * 0.8) {
      return verdict(
        'MAX_VOLATILITY',
        'WARN',
        `Volatility ${context.volatilityPct.toFixed(2)}% is elevated`,
      );
    }
    return verdict('MAX_VOLATILITY', 'PASS', `Volatility is below the ${cap}% limit`);
  },
};
