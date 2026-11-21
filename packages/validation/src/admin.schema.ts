import { z } from 'zod';
import { nonEmptyString } from './common.schema';

/** README §8.2 admin provider write; the P07 skeleton is honestly unimplemented. */
export const adminProviderUpdateSchema = z.strictObject({
  provider: nonEmptyString.max(120),
  enabled: z.boolean(),
});

export type AdminProviderUpdateInput = z.infer<typeof adminProviderUpdateSchema>;
