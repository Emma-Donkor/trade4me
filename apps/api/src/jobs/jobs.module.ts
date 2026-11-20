import { Module } from '@nestjs/common';
import { QueuesModule } from './queues';
import { JobWorkersService, SchedulerService } from './schedulers';

@Module({
  imports: [QueuesModule],
  providers: [SchedulerService, JobWorkersService],
  exports: [QueuesModule, JobWorkersService],
})
export class JobsModule {}
