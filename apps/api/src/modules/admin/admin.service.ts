import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';
import { HealthService, type ReadinessResult } from '../health/health.service';

export abstract class AdminService {
  abstract health(): Promise<ReadinessResult>;
  abstract users(query: PaginationQuery): CursorPage<never>;
  abstract providers(): { items: never[] };
  abstract models(query: PaginationQuery): CursorPage<never>;
  abstract predictionsPerformance(): { items: never[] };
  abstract auditLogs(query: PaginationQuery): CursorPage<never>;
}

@Injectable()
export class Phase7AdminService extends AdminService {
  constructor(private readonly healthService: HealthService) {
    super();
  }

  health(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }

  users(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }

  providers(): { items: never[] } {
    return { items: [] };
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
