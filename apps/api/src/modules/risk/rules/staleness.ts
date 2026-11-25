import { env } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

/** Freshness comes from P08's quote view, never from the client's clock. */
export const stalenessRule: RiskRule = {
  code: 'DATA_STALENESS',
  evaluate(context) {
    if (context.dataFreshnessSeconds === undefined) {
      return verdict('DATA_STALENESS', 'PASS', 'No quote freshness supplied for this order');
    }
    const limit = Math.max(1, Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120));
    if (context.dataFreshnessSeconds > limit) {
      return verdict(
        'DATA_STALENESS',
        'BLOCK',
        `Market data is ${context.dataFreshnessSeconds}s old; the limit is ${limit}s`,
      );
    }
    if (context.dataFreshnessSeconds > limit * 0.75) {
      return verdict(
        'DATA_STALENESS',
        'WARN',
        `Market data is ${context.dataFreshnessSeconds}s old and nearing the ${limit}s limit`,
      );
    }
    return verdict('DATA_STALENESS', 'PASS', `Market data is ${context.dataFreshnessSeconds}s old`);
  },
};
