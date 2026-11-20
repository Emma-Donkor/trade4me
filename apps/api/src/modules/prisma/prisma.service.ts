import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { dependencyError, type DependencyStatus } from '../health/dependency-status';

interface MinimalPrismaClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $queryRawUnsafe(query: string): Promise<unknown>;
}

/**
 * Owns the Prisma connection lifecycle. The generated client arrives in PHASE
 * 04; until then the service reports `down` instead of crashing the API.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: MinimalPrismaClient | null = null;
  private initializationError: string | null = null;

  async onModuleInit(): Promise<void> {
    try {
      const { PrismaClient } = await import('@ts/database');
      const client = new PrismaClient() as unknown as MinimalPrismaClient;
      await client.$connect();
      this.client = client;
    } catch (error) {
      this.initializationError = dependencyError(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.$disconnect();
  }

  isReady(): boolean {
    return this.client !== null;
  }

  async check(): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
      if (!this.client) {
        throw new Error(this.initializationError ?? 'Prisma client is generated in PHASE 04');
      }
      await this.client.$queryRawUnsafe('SELECT 1');
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
