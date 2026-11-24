import { Module } from '@nestjs/common';
import { FeatureModule } from '../modules/market/feature.module';
import { MarketModule } from '../modules/market/market.module';
import { NewsModule } from '../modules/news/news.module';
import { AiEngineClient, AI_ENGINE_FETCH } from '../modules/technical-analysis/ai-engine.client';
import { WebsocketModule } from '../modules/websocket/websocket.module';
import { BackfillProcessor } from './processors/backfill.processor';
import { DriftProcessor } from './processors/drift.processor';
import { FeaturesProcessor } from './processors/features.processor';
import { IntegrityProcessor } from './processors/integrity.processor';
import { MarketSyncProcessor } from './processors/market-sync.processor';
import { ModelEvalProcessor } from './processors/model-eval.processor';
import { NewsIngestProcessor } from './processors/news-ingest.processor';
import { OutcomesProcessor } from './processors/outcomes.processor';
import { QueuesModule } from './queues';
import { JobWorkersService, SchedulerService } from './schedulers';

@Module({
  imports: [QueuesModule, MarketModule, NewsModule, FeatureModule, WebsocketModule],
  providers: [
    SchedulerService,
    JobWorkersService,
    MarketSyncProcessor,
    BackfillProcessor,
    IntegrityProcessor,
    NewsIngestProcessor,
    FeaturesProcessor,
    ModelEvalProcessor,
    OutcomesProcessor,
    DriftProcessor,
    AiEngineClient,
    {
      provide: AI_ENGINE_FETCH,
      useValue: (url: string, init?: RequestInit) => fetch(url, init),
    },
  ],
  exports: [QueuesModule, JobWorkersService, OutcomesProcessor, DriftProcessor],
})
export class JobsModule {}
