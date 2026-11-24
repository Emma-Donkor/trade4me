import { Injectable } from '@nestjs/common';
import type { AdminProviderView, PaginationQuery } from '@ts/types';
import type { AdminProviderUpdateInput } from '@ts/validation';
import { notImplemented } from '../../common/errors/stub-errors';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';
import { HealthService, type ReadinessResult } from '../health/health.service';
import { ProviderRegistry } from '../market/providers/provider.registry';

export abstract class AdminService {
  abstract health(): Promise<ReadinessResult>;
  abstract users(query: PaginationQuery): CursorPage<never>;
  abstract providers(): { items: AdminProviderView[] };
  abstract setProviderEnabled(input: AdminProviderUpdateInput): never;
  abstract models(query: PaginationQuery): CursorPage<never>;
  abstract predictionsPerformance(): { items: never[] };
  abstract auditLogs(query: PaginationQuery): CursorPage<never>;
}

@Injectable()
export class Phase7AdminService extends AdminService {
  constructor(
    private readonly healthService: HealthService,
    private readonly providersRegistry: ProviderRegistry,
  ) {
    super();
  }

  health(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }

  users(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  providers(): { items: AdminProviderView[] } {
    return { items: this.providersRegistry.views() };
  }

  setProviderEnabled(): never {
    notImplemented('provider status update');
  }

  models(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  predictionsPerformance(): { items: never[] } {
    return { items: [] };
  }

  auditLogs(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }
}
