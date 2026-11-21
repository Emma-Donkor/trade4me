import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { EventsGateway } from './gateway';

@Module({
  imports: [RedisModule, AuthModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebsocketModule {}
