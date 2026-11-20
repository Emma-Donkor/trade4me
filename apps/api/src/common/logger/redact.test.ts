import { redact } from './redact';

describe('redact', () => {
  it('redacts credentials at any nesting depth', () => {
    const result = redact({
      authorization: 'Bearer secret',
      cookie: 'ts_refresh=secret',
      DATABASE_URL: 'postgresql://user:pass@host/db',
      MARKET_API_KEY: 'key-123',
      nested: { AI_API_KEY: 'key-456', safe: 'visible' },
    }) as Record<string, unknown>;

    expect(result.authorization).toBe('[REDACTED]');
    expect(result.cookie).toBe('[REDACTED]');
    expect(result.DATABASE_URL).toBe('[REDACTED]');
    expect(result.MARKET_API_KEY).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).AI_API_KEY).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).safe).toBe('visible');
  });

  it('does not leak error stacks', () => {
    const result = redact(new Error('sensitive detail')) as Record<string, unknown>;
    expect(result).toEqual({ name: 'Error', message: 'sensitive detail' });
    expect(result.stack).toBeUndefined();
  });
});
