import { Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import { Prisma } from '@ts/database';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';

export interface OutcomesJobData {
  limit?: number;
}

/**
 * Mirror the P13 labelling rule exactly: the basis is the close at the feature
 * timestamp, and the label is 1 when any strictly later close in the horizon
 * rises by at least the threshold. Using the first *future* close as the basis
 * (or a direction-aware label) would score live predictions against a target
 * the model was never trained on.
 */
export function resolveMove(
  basisClose: number,
  futureCloses: readonly number[],
  thresholdPct: number,
): { actualMovePct: number; label: 0 | 1 } {
  if (basisClose <= 0 || thresholdPct <= 0 || futureCloses.length === 0) {
    return { actualMovePct: 0, label: 0 };
  }
  let up = 0;
  for (const close of futureCloses) {
    up = Math.max(up, ((close - basisClose) / basisClose) * 100);
  }
  const actualMovePct = Number(up.toFixed(4));
  return { actualMovePct, label: actualMovePct >= thresholdPct ? 1 : 0 };
}

/** Start of the label window: the vector's `asOf`, never the wall-clock write. */
export function labelStartOf(snapshot: Prisma.JsonValue, fallback: Date): Date {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) return fallback;
  const asOf = (snapshot as Record<string, unknown>).asOf;
  if (typeof asOf !== 'string') return fallback;
  const date = new Date(asOf);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/** Hourly closer of the P14 evaluation loop. */
@Injectable()
export class OutcomesProcessor extends IdempotentProcessor<OutcomesJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: OutcomesJobData): Promise<void> {
    const client = this.prisma.getClient();
    const now = new Date();
    const pending = await client.prediction.findMany({
      where: { outcome: null },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(data.limit ?? 500, 1), 2_000),
      select: {
        id: true,
        pairId: true,
        timeframe: true,
        horizon: true,
        createdAt: true,
        featuresSnapshot: true,
        probability: true,
      },
    });

    let resolved = 0;
    let correct = 0;
    for (const prediction of pending) {
      const start = labelStartOf(prediction.featuresSnapshot, prediction.createdAt);
      const horizonEnd = new Date(start.getTime() + prediction.horizon * 60_000);
      if (horizonEnd > now) continue;

      // Reference close at the vector's own timestamp, never a future input.
      const basis = await client.marketCandle.findFirst({
        where: {
          pairId: prediction.pairId,
          timeframe: prediction.timeframe,
          timestamp: { lte: start },
        },
        orderBy: { timestamp: 'desc' },
        select: { close: true },
      });
      if (basis === null) continue;

      // Leakage gate: only candles strictly after the vector's timestamp.
      const futures = await client.marketCandle.findMany({
        where: {
          pairId: prediction.pairId,
          timeframe: prediction.timeframe,
          timestamp: { gt: start, lte: horizonEnd },
        },
        orderBy: { timestamp: 'asc' },
        take: 10_000,
        select: { close: true },
      });
      if (futures.length === 0) continue;

      const { actualMovePct, label } = resolveMove(
        Number(basis.close),
        futures.map((candle) => Number(candle.close)),
        env.PREDICTION_THRESHOLD,
      );
      const predicted = Number(prediction.probability) >= 0.5 ? 1 : 0;
      const isCorrect = predicted === label;
      await client.predictionOutcome.upsert({
        where: { predictionId: prediction.id },
        create: {
          predictionId: prediction.id,
          resolvedAt: horizonEnd,
          actualMovePct,
          label,
          correct: isCorrect,
        },
        update: {
          resolvedAt: horizonEnd,
          actualMovePct,
          label,
          correct: isCorrect,
        },
      });
      resolved += 1;
      if (isCorrect) correct += 1;
    }

    await this.recomputeAccuracy();
    if (resolved > 0) {
      this.logger.log('prediction outcomes resolved', 'WORKER', {
        resolved,
        correct,
        accuracy: Number((correct / resolved).toFixed(4)),
      });
    }
  }

  /** Feed the admin/P28 view and the Python drift job with resolved truth. */
  private async recomputeAccuracy(): Promise<void> {
    const client = this.prisma.getClient();
    const active = await client.modelVersion.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, metrics: true },
    });
    if (active === null) return;
    const rows = await client.prediction.findMany({
      where: { modelVersionId: active.id, outcome: { isNot: null } },
      select: { probability: true, outcome: { select: { label: true } } },
    });
    if (rows.length === 0) return;
    const correct = rows.filter(
      (row) =>
        row.outcome !== null && (Number(row.probability) >= 0.5 ? 1 : 0) === row.outcome.label,
    ).length;
    const metrics =
      active.metrics !== null &&
      typeof active.metrics === 'object' &&
      !Array.isArray(active.metrics)
        ? (active.metrics as Record<string, unknown>)
        : {};
    await client.modelVersion.update({
      where: { id: active.id },
      data: {
        metrics: {
          ...metrics,
          liveAccuracy: Number((correct / rows.length).toFixed(6)),
          resolvedOutcomes: rows.length,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
