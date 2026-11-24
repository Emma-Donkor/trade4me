import { Injectable } from '@nestjs/common';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { SystemEventService } from '../../modules/market/system-event.service';
import { AiEngineClient } from '../../modules/technical-analysis/ai-engine.client';
import { EventsService } from '../../modules/websocket/events.service';
import { IdempotentProcessor } from '../base.processor';

export interface DriftJobData {
  minSamples?: number;
  recentWindow?: number;
  accuracyDrop?: number;
  brierIncrease?: number;
}

/** Daily P14 drift check; a degraded model is surfaced loudly, never ignored. */
@Injectable()
export class DriftProcessor extends IdempotentProcessor<DriftJobData> {
  constructor(
    logger: JsonLogger,
    redis: RedisService,
    private readonly ai: AiEngineClient,
    private readonly prisma: PrismaService,
    private readonly systemEvents: SystemEventService,
    private readonly events: EventsService,
  ) {
    super(logger, redis);
  }

  protected async handle(data: DriftJobData): Promise<void> {
    const report = await this.ai.drift({
      minSamples: data.minSamples ?? 20,
      recentWindow: data.recentWindow ?? 50,
      accuracyDrop: data.accuracyDrop ?? 0.1,
      brierIncrease: data.brierIncrease ?? 0.05,
    });
    const client = this.prisma.getClient();
    const active = await client.modelVersion.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, version: true },
    });
    if (active === null || `${active.name}-${active.version}` !== report.modelVersion) {
      this.logger.log('drift verdict ignored: no matching ACTIVE model', 'WORKER', {
        modelVersion: report.modelVersion,
        status: report.status,
      });
      return;
    }
    if (report.status === 'HEALTHY') return;

    await client.modelVersion.update({
      where: { id: active.id },
      data: { status: 'DRIFT_WARNING' },
    });
    await this.systemEvents.modelDrift(report as unknown as Record<string, unknown>);
    this.events.notificationNew({
      notification: {
        id: `drift-${active.id}-${Date.now()}`,
        type: 'MODEL_DRIFT',
        title: 'MODEL PERFORMANCE WARNING',
        body: `${report.modelVersion} degraded: ${report.reason ?? 'rolling performance dropped'}`,
        payload: report as unknown as Record<string, unknown>,
        read: false,
        createdAt: new Date().toISOString(),
      },
    });
    this.logger.warn(`MODEL PERFORMANCE WARNING: ${report.modelVersion}`, 'WORKER', {
      ...report,
    });
  }
}
