import { Module } from '@nestjs/common';
import { MarketModule } from '../modules/market/market.module';
import { MarketSyncProcessor } from './processors/market-sync.processor';
import { QueuesModule } from './queues';
import { JobWorkersService, SchedulerService } from './schedulers';

@Module({
  imports: [QueuesModule, MarketModule],
  providers: [SchedulerService, JobWorkersService, MarketSyncProcessor],
  exports: [QueuesModule, JobWorkersService],
})
export class JobsModule {}
