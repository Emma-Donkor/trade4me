import { Module } from '@nestjs/common';
import { MarketModule } from '../modules/market/market.module';
import { NewsModule } from '../modules/news/news.module';
import { BackfillProcessor } from './processors/backfill.processor';
import { IntegrityProcessor } from './processors/integrity.processor';
import { MarketSyncProcessor } from './processors/market-sync.processor';
import { NewsIngestProcessor } from './processors/news-ingest.processor';
import { QueuesModule } from './queues';
import { JobWorkersService, SchedulerService } from './schedulers';

@Module({
  imports: [QueuesModule, MarketModule, NewsModule],
  providers: [
    SchedulerService,
    JobWorkersService,
    MarketSyncProcessor,
    BackfillProcessor,
    IntegrityProcessor,
    NewsIngestProcessor,
  ],
  exports: [QueuesModule, JobWorkersService],
})
export class JobsModule {}
