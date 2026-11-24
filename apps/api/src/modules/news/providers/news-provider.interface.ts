import type { NewsImpact } from '@ts/types';

export interface RawNewsArticle {
  source: string;
  sourceUrl: string;
  title: string;
  description?: string;
  content?: string;
  publishedAt: Date;
}

export interface RawEconomicEvent {
  eventName: string;
  currency: string;
  scheduledAt: Date;
  impact: NewsImpact;
  previous?: number | null;
  forecast?: number | null;
  actual?: number | null;
}

/**
 * Provider-agnostic news/calendar boundary. The mock adapter is the keyless
 * default; production adapters stay behind `NEWS_API_KEY`/calendar key.
 */
export interface NewsProvider {
  readonly name: string;
  fetchArticles(now: Date): Promise<RawNewsArticle[]>;
  fetchEvents(now: Date): Promise<RawEconomicEvent[]>;
}

export const NEWS_PROVIDERS = Symbol('NEWS_PROVIDERS');
export const NEWS_HTTP_FETCH = Symbol('NEWS_HTTP_FETCH');
export type NewsFetch = (url: string, init?: RequestInit) => Promise<Response>;

export class NewsProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'NewsProviderError';
  }
}
