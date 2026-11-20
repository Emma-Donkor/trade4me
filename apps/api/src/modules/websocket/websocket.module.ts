import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { EventsGateway } from './gateway';

@Module({
  imports: [RedisModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebsocketModule {}
