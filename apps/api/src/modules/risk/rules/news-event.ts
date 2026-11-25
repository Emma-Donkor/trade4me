import { NEWS_RISK_WINDOW_MINUTES } from '@ts/config';
import type { RiskRule } from './rule.interface';
import { verdict } from './rule.interface';

function currencies(symbol: string): string[] {
  return symbol.toUpperCase().split('/');
}

/** Proximity already comes from P11; this rule only decides what to do about it. */
export const newsEventRule: RiskRule = {
  code: 'NEWS_EVENT_RESTRICTION',
  evaluate(context) {
    const relevant = context.imminentEvents.filter((event) => {
      const currency = event.currency.toUpperCase();
      const matches = currencies(context.symbol).includes(currency);
      const minutes = event.minutesUntil ?? NEWS_RISK_WINDOW_MINUTES;
      return matches && minutes >= 0 && minutes <= NEWS_RISK_WINDOW_MINUTES;
    });
    if (relevant.length === 0) {
      return verdict(
        'NEWS_EVENT_RESTRICTION',
        'PASS',
        'No imminent high-impact event for this symbol',
      );
    }
    const names = relevant.map((event) => event.eventName).join(', ');
    return verdict(
      'NEWS_EVENT_RESTRICTION',
      context.profile.newsEventRestrictions ? 'BLOCK' : 'WARN',
      `High-impact event(s) within ${NEWS_RISK_WINDOW_MINUTES} minutes: ${names}`,
    );
  },
};
