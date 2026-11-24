import { Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import { Prisma, type Direction } from '@ts/database';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { IdempotentProcessor } from '../base.processor';

export interface OutcomesJobData {
  limit?: number;
}

/**
 * Resolve a prediction from post-prediction closes only. The first close after
 * the prediction is the basis; using any earlier candle would leak the input
 * that produced the prediction back into its outcome.
 */
export function resolveMove(
  closes: readonly number[],
  direction: Direction,
  thresholdPct: number,
): { actualMovePct: number; label: 0 | 1 } {
  if (closes.length === 0 || thresholdPct <= 0) {
    return { actualMovePct: 0, label: 0 };
  }
  const basis = closes[0];
  let up = 0;
  let down = 0;
  for (const close of closes.slice(1)) {
    const move = ((close - basis) / basis) * 100;
    up = Math.max(up, move);
    down = Math.max(down, -move);
  }
  const actual = direction === 'LONG' ? up : direction === 'SHORT' ? down : Math.max(up, down);
  const actualMovePct = Number(actual.toFixed(4));
  return { actualMovePct, label: actualMovePct >= thresholdPct ? 1 : 0 };
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
        direction: true,
        probability: true,
      },
    });

    let resolved = 0;
    let correct = 0;
    for (const prediction of pending) {
      const horizonEnd = new Date(prediction.createdAt.getTime() + prediction.horizon * 60_000);
      if (horizonEnd > now) continue;

      // Leakage gate: the WHERE clause is strictly after the prediction time.
      const candles = await client.marketCandle.findMany({
        where: {
          pairId: prediction.pairId,
          timeframe: prediction.timeframe,
          timestamp: { gt: prediction.createdAt, lte: horizonEnd },
        },
        orderBy: { timestamp: 'asc' },
        take: 10_000,
        select: { close: true },
      });
      if (candles.length === 0) continue;

      const { actualMovePct, label } = resolveMove(
        candles.map((candle) => Number(candle.close)),
        prediction.direction,
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
