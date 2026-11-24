import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';
import { HEALTH_SERVICE, HealthService } from './health.service';

@Module({
  imports: [RedisModule, PrismaModule, MarketModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: HEALTH_SERVICE, useExisting: HealthService }],
  exports: [HealthService],
})
export class HealthModule {}
