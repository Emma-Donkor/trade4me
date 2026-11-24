import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JsonLogger } from '../../common/logger/json-logger';
import { PrismaService } from '../prisma/prisma.service';
import type { TimestampRejectionReason } from './providers/provider.errors';

/** README §9.2 — rejections and provider failures are auditable SystemEvents. */
@Injectable()
export class SystemEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  async providerFailure(
    provider: string,
    kind: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.record('ERROR', 'PROVIDER', `provider_failure:${kind}`, {
      provider,
      kind,
      ...details,
    });
  }

  async timestampRejected(
    provider: string,
    reason: TimestampRejectionReason,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.record('WARN', 'PROVIDER', `timestamp_rejected:${reason}`, {
      ...details,
      provider,
      reason,
    });
  }

  /** P09 — history ingestion, gap detection and repair are auditable. */
  async history(
    code: string,
    details: Record<string, unknown> = {},
    level: 'INFO' | 'WARN' | 'ERROR' = 'WARN',
  ): Promise<void> {
    await this.record(level, 'WORKER', code, details);
  }

  /** P14 — a drifting model is an auditable WARN, never a silent downgrade. */
  async modelDrift(details: Record<string, unknown> = {}): Promise<void> {
    await this.record('WARN', 'AI', 'model_performance_warning', details);
  }

  private async record(
    level: 'INFO' | 'WARN' | 'ERROR',
    source: 'API' | 'AI' | 'WORKER' | 'PROVIDER',
    code: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.getClient().systemEvent.create({
        data: {
          level,
          source,
          message: code,
          code,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Auditing must never take down the request path.
      this.logger.warn(
        `Could not persist SystemEvent ${code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'MARKET',
      );
    }
  }
}
