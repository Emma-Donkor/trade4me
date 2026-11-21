import type { ErrorCode } from '@ts/types';
import { z } from 'zod';

/** README §8.4 plus generic HTTP codes emitted by the API filter. */
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'MARKET_DATA_STALE',
  'MARKET_DATA_UNAVAILABLE',
  'NO_TRADE_RULE_VIOLATION',
  'RATE_LIMITED',
  'AI_SERVICE_UNAVAILABLE',
  'INSUFFICIENT_DATA',
  'BAD_REQUEST',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
  'HTTP_ERROR',
] as const satisfies readonly ErrorCode[];

export const errorCodeSchema = z.enum(ERROR_CODES);

export const nonEmptyString = z.string().min(1);

/** Counts decimal places without string-formatting surprises from exponents. */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const [mantissa, exponent] = value.toString().toLowerCase().split('e');
  const base = mantissa.includes('.') ? mantissa.length - mantissa.indexOf('.') - 1 : 0;
  return exponent === undefined ? base : Math.max(0, base - Number(exponent));
}

/** Monetary and price inputs are finite numbers with bounded precision. */
export const moneySchema = z
  .number()
  .finite()
  .refine((value) => decimalPlaces(value) <= 8, {
    message: 'Monetary values may have at most 8 decimal places',
  });

export const positiveMoneySchema = moneySchema.refine((value) => value > 0, {
  message: 'Monetary values must be greater than zero',
});

export const percentageSchema = z.number().finite().min(0).max(100);

export const dateTimeSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Expected an ISO-8601 date/time',
  });

/** README §8.1 + repository pagination: both cursor and page styles are typed. */
export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().positive().max(100_000).optional(),
  pageSize: z.coerce.number().int().positive().max(500).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  cursor: nonEmptyString.optional(),
});

export const idSchema = nonEmptyString;

export const symbolSchema = nonEmptyString.regex(/^[A-Z]{3,10}(\/[A-Z]{3,10})?$/, {
  message: 'Expected a pair such as EUR/USD or EURUSD',
});

export function isoAfterOrEqual(fromKey: string, toKey: string) {
  return <T extends Record<string, unknown>>(value: T): boolean =>
    Date.parse(String(value[toKey])) >= Date.parse(String(value[fromKey]));
}
