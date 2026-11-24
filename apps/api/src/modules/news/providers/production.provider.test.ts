import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '@ts/config';
import { NewsProviderError, type NewsFetch } from './news-provider.interface';
import { fetchJson, HttpNewsProvider } from './production.provider';

describe('P11 production news adapters', () => {
  const mutableEnv = env as unknown as Record<string, unknown>;
  const original = { NEWS_PROVIDER: env.NEWS_PROVIDER, NEWS_API_KEY: env.NEWS_API_KEY };

  afterEach(() => {
    Object.assign(mutableEnv, original);
  });

  it('never calls a provider without a server-side key', async () => {
    mutableEnv.NEWS_PROVIDER = 'newsapi';
    mutableEnv.NEWS_API_KEY = '';
    const limiter = { acquire: jest.fn(async () => undefined) };
    const provider = new HttpNewsProvider(limiter as never);

    await expect(provider.fetchArticles(new Date())).rejects.toBeInstanceOf(NewsProviderError);
    expect(limiter.acquire).not.toHaveBeenCalled();
  });

  it('rejects non-allowlisted hosts before any request', async () => {
    const fetchImpl = jest.fn() as unknown as NewsFetch;
    await expect(fetchJson('https://evil.example/collect', 'newsapi', fetchImpl)).rejects.toThrow(
      /not allowlisted/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns parsed JSON and rate-limits allowlisted hosts', async () => {
    mutableEnv.NEWS_PROVIDER = 'finnhub';
    mutableEnv.NEWS_API_KEY = 'test-key';
    const limiter = { acquire: jest.fn(async () => undefined) };
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => [{ headline: 'Rates rise', url: 'https://finnhub.io/a', datetime: 1 }],
    })) as unknown as NewsFetch;
    const provider = new HttpNewsProvider(limiter as never, fetchImpl);

    const articles = await provider.fetchArticles(new Date());
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({ title: 'Rates rise', source: 'finnhub' });
    expect(limiter.acquire).toHaveBeenCalledTimes(1);
  });
});
