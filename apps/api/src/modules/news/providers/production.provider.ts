import { Inject, Injectable, Optional } from '@nestjs/common';
import { env } from '@ts/config';
import type { NewsImpact } from '@ts/types';
import {
  NEWS_HTTP_FETCH,
  NewsProviderError,
  type NewsFetch,
  type NewsProvider,
  type RawEconomicEvent,
  type RawNewsArticle,
} from './news-provider.interface';
import { NewsRateLimiter } from './news-rate-limiter';

const TIMEOUT_MS = 5_000;
const ALLOWED_HOSTS = new Set(['newsapi.org', 'finnhub.io']);

/** Only these hosts may ever receive a key; everything else is rejected. */
export async function fetchJson(
  url: string,
  provider: string,
  fetchImpl: NewsFetch | undefined,
): Promise<unknown> {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    throw new NewsProviderError(`news host ${host} is not allowlisted`, provider, false);
  }
  const fetchFn =
    fetchImpl ??
    ((input: string, init?: RequestInit) => fetch(input, init) as unknown as Promise<Response>);
  try {
    const response = await fetchFn(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new NewsProviderError(
        `news provider ${provider} returned HTTP ${response.status}`,
        provider,
        response.status === 429 || response.status >= 500,
      );
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof NewsProviderError) throw error;
    throw new NewsProviderError(
      `news provider ${provider} request failed: ${error instanceof Error ? error.message : String(error)}`,
      provider,
      true,
    );
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  const result = typeof value === 'string' ? value.trim() : '';
  return result.length > 0 ? result : undefined;
}

function numeric(value: unknown): number | undefined {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function impact(value: unknown): NewsImpact {
  const raw = text(value)?.toUpperCase();
  return raw === 'EXTREME' || raw === 'HIGH' || raw === 'LOW' ? raw : 'MEDIUM';
}

function newsApiArticles(payload: unknown): RawNewsArticle[] {
  const items = Array.isArray(record(payload).articles)
    ? (payload as { articles: unknown[] }).articles
    : [];
  return items.flatMap((entry) => {
    const item = record(entry);
    const title = text(item.title);
    const url = text(item.url);
    const published = text(item.publishedAt);
    if (!title || !url || !published) return [];
    return [
      {
        source: text(record(item.source).name) ?? 'newsapi',
        sourceUrl: url,
        title,
        ...(text(item.description) ? { description: text(item.description) } : {}),
        ...(text(item.content) ? { content: text(item.content) } : {}),
        publishedAt: new Date(published),
      },
    ];
  });
}

function finnhubArticles(payload: unknown): RawNewsArticle[] {
  const items = Array.isArray(payload) ? (payload as unknown[]) : [];
  return items.flatMap((entry) => {
    const item = record(entry);
    const title = text(item.headline);
    const url = text(item.url);
    const datetime = numeric(item.datetime);
    if (!title || !url || datetime === undefined) return [];
    return [
      {
        source: text(item.source) ?? 'finnhub',
        sourceUrl: url,
        title,
        ...(text(item.summary) ? { description: text(item.summary) } : {}),
        publishedAt: new Date(datetime * 1000),
      },
    ];
  });
}

function finnhubEvents(payload: unknown): RawEconomicEvent[] {
  const items = Array.isArray(payload) ? (payload as unknown[]) : [];
  return items.flatMap((entry) => {
    const item = record(entry);
    const eventName = text(item.event);
    const currency = text(item.country)?.toUpperCase();
    const scheduledAt = text(item.time);
    if (!eventName || !currency || !scheduledAt) return [];
    return [
      {
        eventName,
        currency,
        scheduledAt: new Date(scheduledAt),
        impact: impact(item.impact),
        ...(numeric(item.prev) !== undefined ? { previous: numeric(item.prev) } : {}),
        ...(numeric(item.estimate) !== undefined ? { forecast: numeric(item.estimate) } : {}),
        ...(numeric(item.actual) !== undefined ? { actual: numeric(item.actual) } : {}),
      },
    ];
  });
}

/** NewsAPI/Finnhub adapter; selected by `NEWS_PROVIDER`, never called keyless. */
@Injectable()
export class HttpNewsProvider implements NewsProvider {
  readonly name: 'newsapi' | 'finnhub';
  private readonly key: string;
  private readonly fetchImpl: NewsFetch | undefined;

  constructor(
    private readonly limiter: NewsRateLimiter,
    @Inject(NEWS_HTTP_FETCH) @Optional() fetchImpl?: NewsFetch,
  ) {
    this.name = String(env.NEWS_PROVIDER ?? 'mock') === 'finnhub' ? 'finnhub' : 'newsapi';
    this.key = String(env.NEWS_API_KEY ?? '');
    this.fetchImpl = fetchImpl;
  }

  async fetchArticles(_now: Date): Promise<RawNewsArticle[]> {
    if (!this.key) {
      throw new NewsProviderError('NEWS_API_KEY is required for HTTP news', this.name, false);
    }
    await this.limiter.acquire(this.name);
    const url =
      this.name === 'finnhub'
        ? `https://finnhub.io/api/v1/news?category=forex&token=${encodeURIComponent(this.key)}`
        : `https://newsapi.org/v2/everything?q=forex&pageSize=50&apiKey=${encodeURIComponent(this.key)}`;
    const payload = await fetchJson(url, this.name, this.fetchImpl);
    return this.name === 'finnhub' ? finnhubArticles(payload) : newsApiArticles(payload);
  }

  /** NewsAPI has no calendar endpoint; Finnhub also serves the calendar. */
  async fetchEvents(_now: Date): Promise<RawEconomicEvent[]> {
    if (this.name !== 'finnhub' || !this.key) return [];
    await this.limiter.acquire(`${this.name}-calendar`);
    const url = `https://finnhub.io/api/v1/economic-calendar?token=${encodeURIComponent(this.key)}`;
    return finnhubEvents(await fetchJson(url, this.name, this.fetchImpl));
  }
}

/** Standalone calendar adapter behind `ECONOMIC_CALENDAR_API_KEY`. */
@Injectable()
export class HttpCalendarProvider implements NewsProvider {
  readonly name = 'economic-calendar';
  private readonly key: string;
  private readonly fetchImpl: NewsFetch | undefined;

  constructor(
    private readonly limiter: NewsRateLimiter,
    @Inject(NEWS_HTTP_FETCH) @Optional() fetchImpl?: NewsFetch,
  ) {
    this.key = String(env.ECONOMIC_CALENDAR_API_KEY ?? '');
    this.fetchImpl = fetchImpl;
  }

  async fetchArticles(_now: Date): Promise<RawNewsArticle[]> {
    return [];
  }

  async fetchEvents(_now: Date): Promise<RawEconomicEvent[]> {
    if (!this.key) return [];
    await this.limiter.acquire(this.name);
    const url = `https://finnhub.io/api/v1/economic-calendar?token=${encodeURIComponent(this.key)}`;
    return finnhubEvents(await fetchJson(url, this.name, this.fetchImpl));
  }
}
