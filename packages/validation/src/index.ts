import { z } from 'zod';

export { z };

/** Minimal liveness response shared by the API and AI service health checks. */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

export * from './common.schema';
export * from './admin.schema';
export * from './auth.schema';
export * from './user.schema';
export * from './market.schema';
export * from './backtest.schema';
export * from './paper.schema';
export * from './risk.schema';
export * from './watchlist.schema';
export * from './ai';
export * from './openapi';
