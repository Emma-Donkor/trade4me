import { Injectable } from '@nestjs/common';
import type { AdminProviderView, ModelPerformanceView, PaginationQuery } from '@ts/types';
import type { AdminProviderUpdateInput } from '@ts/validation';
import { notImplemented } from '../../common/errors/stub-errors';
import { emptyPage, type CursorPage } from '../../common/helpers/pagination';
import { HealthService, type ReadinessResult } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../market/providers/provider.registry';

export abstract class AdminService {
  abstract health(): Promise<ReadinessResult>;
  abstract users(query: PaginationQuery): CursorPage<never>;
  abstract providers(): { items: AdminProviderView[] };
  abstract setProviderEnabled(input: AdminProviderUpdateInput): never;
  abstract models(query: PaginationQuery): CursorPage<never>;
  abstract predictionsPerformance(): Promise<{ items: ModelPerformanceView[] }>;
  abstract auditLogs(query: PaginationQuery): CursorPage<never>;
}

@Injectable()
export class Phase7AdminService extends AdminService {
  constructor(
    private readonly healthService: HealthService,
    private readonly providersRegistry: ProviderRegistry,
    private readonly prisma: PrismaService,
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

  /** P14 — the P28 surface reads only recorded outcomes, never estimates. */
  async predictionsPerformance(): Promise<{ items: ModelPerformanceView[] }> {
    const versions = await this.prisma.getClient().modelVersion.findMany({
      where: { predictions: { some: {} } },
      select: {
        name: true,
        version: true,
        status: true,
        predictions: {
          select: { probability: true, outcome: { select: { label: true } } },
        },
      },
    });
    const items = versions.map((version): ModelPerformanceView => {
      const resolved = version.predictions.filter((row) => row.outcome !== null);
      const correct = resolved.filter(
        (row) =>
          row.outcome !== null && (Number(row.probability) >= 0.5 ? 1 : 0) === row.outcome.label,
      ).length;
      const brier = resolved.reduce(
        (sum, row) =>
          row.outcome === null ? sum : sum + (Number(row.probability) - row.outcome.label) ** 2,
        0,
      );
      return {
        modelVersion: `${version.name}-${version.version}`,
        status: version.status,
        predictions: version.predictions.length,
        resolved: resolved.length,
        accuracy: resolved.length === 0 ? 0 : Number((correct / resolved.length).toFixed(6)),
        brierScore: resolved.length === 0 ? 0 : Number((brier / resolved.length).toFixed(6)),
      };
    });
    return { items };
  }

  auditLogs(query: PaginationQuery): CursorPage<never> {
    return emptyPage(query);
  }
}
