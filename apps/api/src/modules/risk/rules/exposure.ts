import { RISK_HARD_CAPS } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

export const exposureRule: RiskRule = {
  code: 'MAX_PORTFOLIO_EXPOSURE',
  evaluate(context) {
    const cap = Math.min(
      context.profile.maxPortfolioExposurePct,
      RISK_HARD_CAPS.maxPortfolioExposurePct,
    );
    if (context.portfolioExposurePct > cap) {
      return verdict(
        'MAX_PORTFOLIO_EXPOSURE',
        'BLOCK',
        `Portfolio exposure ${context.portfolioExposurePct.toFixed(2)}% exceeds the ${cap}% limit`,
      );
    }
    if (context.portfolioExposurePct > cap * 0.8) {
      return verdict(
        'MAX_PORTFOLIO_EXPOSURE',
        'WARN',
        `Portfolio exposure ${context.portfolioExposurePct.toFixed(2)}% is approaching the ${cap}% limit`,
      );
    }
    return verdict(
      'MAX_PORTFOLIO_EXPOSURE',
      'PASS',
      `Portfolio exposure is below the ${cap}% limit`,
    );
  },
};
