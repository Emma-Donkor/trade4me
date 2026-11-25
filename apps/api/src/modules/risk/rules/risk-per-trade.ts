import { env } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

/** The hard ceiling is configuration; a profile override cannot raise it. */
export const riskPerTradeRule: RiskRule = {
  code: 'MAX_RISK_PER_TRADE',
  evaluate(context) {
    if (context.profile.riskPerTradePct > env.MAX_RISK_PER_TRADE_PCT) {
      return verdict(
        'MAX_RISK_PER_TRADE',
        'BLOCK',
        `Requested risk ${context.profile.riskPerTradePct}% exceeds the ${env.MAX_RISK_PER_TRADE_PCT}% hard cap`,
      );
    }
    // Client-sent size is never trusted: it is re-checked against server sizing.
    if (context.size > context.maxAllowedSize * 1.0000001) {
      return verdict(
        'MAX_RISK_PER_TRADE',
        'BLOCK',
        `Order size ${context.size} exceeds the risk-budget maximum ${context.maxAllowedSize.toFixed(6)}`,
      );
    }
    if (
      context.size > context.maxAllowedSize * 0.9 &&
      context.size < context.maxAllowedSize * 0.9999999
    ) {
      return verdict(
        'MAX_RISK_PER_TRADE',
        'WARN',
        'Order uses more than 90% of the per-trade risk budget',
      );
    }
    return verdict('MAX_RISK_PER_TRADE', 'PASS', 'Order is inside the per-trade risk budget');
  },
};
