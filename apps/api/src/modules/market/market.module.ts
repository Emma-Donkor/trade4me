import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService, MarketServiceImpl } from './market.service';
import { QuoteService } from './quote.service';
import { SystemEventService } from './system-event.service';
import { AlphaVantageProvider } from './providers/alphavantage.provider';
import { MockProvider } from './providers/mock.provider';
import { ProviderHealthStore } from './providers/provider.health';
import { ProviderRateLimiter } from './providers/provider-rate-limiter';
import { MARKET_HTTP_FETCH, MARKET_PROVIDERS } from './providers/provider.interface';
import { ProviderRegistry } from './providers/provider.registry';
import { TwelveDataProvider } from './providers/twelvedata.provider';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [MarketController],
  providers: [
    { provide: MarketService, useClass: MarketServiceImpl },
    QuoteService,
    SystemEventService,
    ProviderHealthStore,
    ProviderRateLimiter,
    ProviderRegistry,
    MockProvider,
    AlphaVantageProvider,
    TwelveDataProvider,
    { provide: MARKET_HTTP_FETCH, useValue: (url: string, init?: RequestInit) => fetch(url, init) },
    {
      provide: MARKET_PROVIDERS,
      useFactory: (
        mock: MockProvider,
        alphaVantage: AlphaVantageProvider,
        twelveData: TwelveDataProvider,
      ) => [mock, alphaVantage, twelveData],
      inject: [MockProvider, AlphaVantageProvider, TwelveDataProvider],
    },
  ],
  exports: [MarketService, QuoteService, ProviderRegistry, ProviderHealthStore],
})
export class MarketModule {}
