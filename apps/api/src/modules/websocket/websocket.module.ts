import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { EventsService } from './events.service';
import { EventsGateway } from './gateway';

@Module({
  imports: [RedisModule, AuthModule],
  providers: [EventsGateway, EventsService],
  exports: [EventsGateway, EventsService],
})
export class WebsocketModule {}
