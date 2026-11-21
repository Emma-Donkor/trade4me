import { describe, expect, it } from '@jest/globals';
import { healthStatusSchema, nonEmptyString } from './index';

describe('@ts/validation', () => {
  it('accepts a valid health status', () => {
    expect(healthStatusSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects an empty string', () => {
    expect(nonEmptyString.safeParse('').success).toBe(false);
  });
});
