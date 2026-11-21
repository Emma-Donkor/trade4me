import { PrismaClient } from '@prisma/client';

type PrismaGlobal = typeof globalThis & { __tradeSensePrisma?: PrismaClient };

/**
 * One client per process. Next.js/watch-mode reloads re-evaluate modules, so the
 * instance is cached on globalThis to avoid exhausting the connection pool.
 */
export function getPrismaClient(): PrismaClient {
  const holder = globalThis as PrismaGlobal;
  if (!holder.__tradeSensePrisma) holder.__tradeSensePrisma = new PrismaClient();
  return holder.__tradeSensePrisma;
}

/** Prisma's `$connect` is idempotent; this is safe to call from every bootstrap. */
export async function softConnect(): Promise<void> {
  await getPrismaClient().$connect();
}

export async function disconnect(): Promise<void> {
  const holder = globalThis as PrismaGlobal;
  if (!holder.__tradeSensePrisma) return;
  await holder.__tradeSensePrisma.$disconnect();
  holder.__tradeSensePrisma = undefined;
}
