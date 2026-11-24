import { Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import { MockNewsProvider } from './mock.provider';
import { HttpCalendarProvider, HttpNewsProvider } from './production.provider';
import type { NewsProvider } from './news-provider.interface';

/** Keyless mock by default; HTTP adapters only when explicitly configured. */
@Injectable()
export class NewsProviderRegistry {
  constructor(
    private readonly mock: MockNewsProvider,
    private readonly httpNews: HttpNewsProvider,
    private readonly httpCalendar: HttpCalendarProvider,
  ) {}

  articles(): NewsProvider {
    return String(env.NEWS_PROVIDER ?? 'mock') === 'mock' ? this.mock : this.httpNews;
  }

  events(): NewsProvider {
    return String(env.ECONOMIC_CALENDAR_PROVIDER ?? 'mock') === 'mock'
      ? this.mock
      : this.httpCalendar;
  }
}
