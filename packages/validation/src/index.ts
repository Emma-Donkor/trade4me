import { z } from 'zod';

export { z };

/** Reusable primitive used by environment and API schemas in later phases. */
export const nonEmptyString = z.string().min(1);

/** Minimal liveness response shared by the API and AI service health checks. */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
