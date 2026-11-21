import type { Prisma } from '@prisma/client';
import { getPrismaClient } from './client';

export type TransactionClient = Prisma.TransactionClient;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/** All multi-table writes go through the one Prisma client. */
export function withTransaction<T>(
  work: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return getPrismaClient().$transaction(work, options);
}
