import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getPrismaClient, type PrismaClient } from '@ts/database';
import { dependencyError, type DependencyStatus } from '../health/dependency-status';

/** Owns the shared Prisma client's connection lifecycle for the API. */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: PrismaClient | null = null;
  private initializationError: string | null = null;

  async onModuleInit(): Promise<void> {
    try {
      const client = getPrismaClient();
      await client.$connect();
      this.client = client;
      this.initializationError = null;
    } catch (error) {
      this.initializationError = dependencyError(error);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.$disconnect();
  }

  isReady(): boolean {
    return this.client !== null;
  }

  /** Typed access for modules that need to query (never raw SQL strings). */
  getClient(): PrismaClient {
    if (!this.client) throw new Error(this.initializationError ?? 'Prisma client is not connected');
    return this.client;
  }

  async check(): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
      await this.getClient().$queryRaw`SELECT 1`;
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
