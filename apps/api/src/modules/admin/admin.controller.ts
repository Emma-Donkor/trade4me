import { Controller, Get, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import { paginationSchema } from '@ts/validation';
import { Roles } from '../../common/decorators/roles';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Roles('ADMIN')
  @Get('health')
  health() {
    return this.admin.health();
  }

  @Roles('ADMIN')
  @Get('users')
  users(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.admin.users(query);
  }

  @Roles('ADMIN')
  @Get('providers')
  providers() {
    return this.admin.providers();
  }

  @Roles('ANALYST')
  @Get('models')
  models(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.admin.models(query);
  }

  @Roles('ANALYST')
  @Get('predictions/performance')
  predictionsPerformance() {
    return this.admin.predictionsPerformance();
  }

  @Roles('ADMIN')
  @Get('audit-logs')
  auditLogs(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.admin.auditLogs(query);
  }
}
