import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { AI_ENGINE_FETCH } from './ai-engine.client';
import { AiEngineClient } from './ai-engine.client';
import { ScoreService } from './score.service';
import { TechnicalAnalysisController } from './technical-analysis.controller';
import {
  TechnicalAnalysisService,
  TechnicalAnalysisServiceImpl,
} from './technical-analysis.service';

@Module({
  imports: [MarketModule, WebsocketModule],
  controllers: [TechnicalAnalysisController],
  providers: [
    AiEngineClient,
    ScoreService,
    { provide: AI_ENGINE_FETCH, useValue: (url: string, init?: RequestInit) => fetch(url, init) },
    { provide: TechnicalAnalysisService, useClass: TechnicalAnalysisServiceImpl },
  ],
  exports: [TechnicalAnalysisService],
})
export class TechnicalAnalysisModule {}
