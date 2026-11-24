import { Injectable } from '@nestjs/common';
import { fixtureArticles, fixtureEvents } from './news.fixtures';
import type { NewsProvider, RawEconomicEvent, RawNewsArticle } from './news-provider.interface';

/**
 * Keyless, deterministic adapter. Timestamps are anchored on the caller's
 * clock so repeated ingest runs are idempotent and tests stay reproducible.
 */
@Injectable()
export class MockNewsProvider implements NewsProvider {
  readonly name = 'mock';

  async fetchArticles(now: Date): Promise<RawNewsArticle[]> {
    return fixtureArticles(now);
  }

  async fetchEvents(now: Date): Promise<RawEconomicEvent[]> {
    return fixtureEvents(now);
  }
}
