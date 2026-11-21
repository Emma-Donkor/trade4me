import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import type { AdminProviderUpdateInput } from '@ts/validation';
import { adminProviderUpdateSchema, paginationSchema } from '@ts/validation';
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

  @Roles('ADMIN')
  @Patch('providers')
  setProviderEnabled(
    @Body(new ZodValidationPipe(adminProviderUpdateSchema)) input: AdminProviderUpdateInput,
  ) {
    return this.admin.setProviderEnabled(input);
  }

  @Roles('ADMIN', 'ANALYST')
  @Get('models')
  models(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.admin.models(query);
  }

  @Roles('ADMIN', 'ANALYST')
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
