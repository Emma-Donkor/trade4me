import { Controller, Get, Inject } from '@nestjs/common';
import { HEALTH_SERVICE, HealthService, type ReadinessResult } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HEALTH_SERVICE) private readonly healthService: HealthService) {}

  @Get()
  liveness(): { status: 'ok' } {
    return this.healthService.liveness();
  }

  @Get('ready')
  readiness(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }
}
