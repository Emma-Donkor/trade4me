import { Controller, Get } from '@nestjs/common';
import { healthStatusSchema, type HealthStatus } from '@ts/validation';

@Controller('health')
export class AppController {
  @Get()
  getHealth(): HealthStatus {
    return healthStatusSchema.parse({ status: 'ok' });
  }
}
