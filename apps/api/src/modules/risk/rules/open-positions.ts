import { RISK_HARD_CAPS } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

export const openPositionsRule: RiskRule = {
  code: 'MAX_OPEN_POSITIONS',
  evaluate(context) {
    const cap = Math.min(context.profile.maxOpenPositions, RISK_HARD_CAPS.maxOpenPositions);
    if (context.openPositions >= cap) {
      return verdict(
        'MAX_OPEN_POSITIONS',
        'BLOCK',
        `${context.openPositions} open positions reached the ${cap} position limit`,
      );
    }
    if (context.openPositions >= cap - 1) {
      return verdict(
        'MAX_OPEN_POSITIONS',
        'WARN',
        `Only one position slot remains before the ${cap} position limit`,
      );
    }
    return verdict('MAX_OPEN_POSITIONS', 'PASS', `Open positions are below the ${cap} limit`);
  },
};
