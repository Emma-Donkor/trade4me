import { describe, expect, it } from '@jest/globals';
import { CRON_REGISTRATIONS, cronPattern } from './schedulers';

describe('cron registrations', () => {
  it('strips inline comments from .env-style cron values', () => {
    expect(cronPattern('0 * * * *          # hourly candle sync', 'fallback')).toBe('0 * * * *');
    expect(cronPattern('   ', 'fallback')).toBe('fallback');
  });

  it('registers every queue with a parseable cron pattern', () => {
    expect(CRON_REGISTRATIONS).toHaveLength(7);
    for (const registration of CRON_REGISTRATIONS) {
      expect(registration.pattern.split(/\s+/)).toHaveLength(5);
    }
  });
});
