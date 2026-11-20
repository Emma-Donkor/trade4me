import { loadEnv } from './env';

describe('@ts/config', () => {
  it('applies keyless development defaults', () => {
    const parsed = loadEnv({ NODE_ENV: 'development' });

    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.AI_PORT).toBe(8000);
    expect(parsed.MARKET_DATA_PROVIDER).toBe('mock');
  });

  it('refuses to boot in production without signing secrets', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(
      'Missing required production environment variables: JWT_SECRET, JWT_REFRESH_SECRET',
    );
  });

  it('rejects malformed ports', () => {
    expect(() => loadEnv({ API_PORT: 'not-a-port' })).toThrow('Invalid environment configuration');
  });
});
