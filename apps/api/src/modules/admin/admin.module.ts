import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { AdminController } from './admin.controller';
import { AdminService, Phase7AdminService } from './admin.service';

@Module({
  imports: [HealthModule],
  controllers: [AdminController],
  providers: [{ provide: AdminService, useClass: Phase7AdminService }],
  exports: [AdminService],
})
export class AdminModule {}
