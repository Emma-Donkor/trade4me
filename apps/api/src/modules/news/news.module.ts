import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NewsController } from './news.controller';
import { NewsService, NewsServiceImpl } from './news.service';
import { NewsAggregatorService } from './aggregator.service';
import { EconomicEventsService } from './economic-events.service';
import { NewsCacheService } from './news-cache.service';
import { NewsIngestionService } from './news-ingestion.service';
import { NEWS_NOW } from './news.tokens';
import { MockNewsProvider } from './providers/mock.provider';
import { NEWS_HTTP_FETCH, type NewsFetch } from './providers/news-provider.interface';
import { NewsProviderRegistry } from './providers/news.registry';
import { NewsRateLimiter } from './providers/news-rate-limiter';
import { HttpCalendarProvider, HttpNewsProvider } from './providers/production.provider';

@Module({
  imports: [MarketModule, WebsocketModule],
  controllers: [NewsController],
  providers: [
    NewsCacheService,
    NewsRateLimiter,
    MockNewsProvider,
    HttpNewsProvider,
    HttpCalendarProvider,
    NewsProviderRegistry,
    NewsAggregatorService,
    EconomicEventsService,
    NewsIngestionService,
    {
      provide: NEWS_HTTP_FETCH,
      useValue: ((url: string, init?: RequestInit) => fetch(url, init)) as NewsFetch,
    },
    { provide: NEWS_NOW, useValue: () => new Date() },
    { provide: NewsService, useClass: NewsServiceImpl },
  ],
  exports: [NewsService, NewsIngestionService, NewsAggregatorService, EconomicEventsService],
})
export class NewsModule {}
