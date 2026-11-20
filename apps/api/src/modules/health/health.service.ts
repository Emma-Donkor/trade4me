import { Inject, Injectable } from '@nestjs/common';
import { HEALTH_CHECK_TIMEOUT_MS } from '@ts/config';
import { configuration } from '../../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { dependencyError, type DependencyStatus } from './dependency-status';

export const HEALTH_SERVICE = 'HEALTH_SERVICE';

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  dependencies: {
    redis: DependencyStatus;
    database: DependencyStatus;
    ai: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessResult> {
    const [redis, database, ai] = await Promise.all([
      this.redis.ping(),
      this.prisma.check(),
      this.checkAi(),
    ]);
    const status = [redis, database, ai].every((item) => item.status === 'up') ? 'ok' : 'degraded';
    return { status, dependencies: { redis, database, ai } };
  }

  private async checkAi(): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${configuration.app.aiUrl}/health`, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`AI service returned HTTP ${response.status}`);
      const body = (await response.json()) as { status?: string };
      if (body.status !== 'ok') throw new Error('AI service reported an unexpected status');
      return { status: 'up', latencyMs: Date.now() - startedAt, error: null };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: dependencyError(error),
      };
    }
  }
}
