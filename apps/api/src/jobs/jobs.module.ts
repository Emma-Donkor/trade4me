import { Module } from '@nestjs/common';
import { MarketModule } from '../modules/market/market.module';
import { BackfillProcessor } from './processors/backfill.processor';
import { IntegrityProcessor } from './processors/integrity.processor';
import { MarketSyncProcessor } from './processors/market-sync.processor';
import { QueuesModule } from './queues';
import { JobWorkersService, SchedulerService } from './schedulers';

@Module({
  imports: [QueuesModule, MarketModule],
  providers: [
    SchedulerService,
    JobWorkersService,
    MarketSyncProcessor,
    BackfillProcessor,
    IntegrityProcessor,
  ],
  exports: [QueuesModule, JobWorkersService],
})
export class JobsModule {}
