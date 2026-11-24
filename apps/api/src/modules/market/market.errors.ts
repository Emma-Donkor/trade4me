import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { ErrorCode } from '@ts/types';

interface MarketError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** README §8.4/§9.2 — never fabricate a quote or a derived analysis. */
export function marketDataUnavailable(details?: Record<string, unknown>): never {
  throw new ServiceUnavailableException({
    code: 'MARKET_DATA_UNAVAILABLE',
    message: 'Current market data is unavailable.',
    ...(details ? { details } : {}),
  } satisfies MarketError);
}

/** Used by downstream consumers that must refuse to analyse stale data. */
export function marketDataStale(details?: Record<string, unknown>): never {
  throw new UnprocessableEntityException({
    code: 'MARKET_DATA_STALE',
    message: 'Current market data is stale.',
    ...(details ? { details } : {}),
  } satisfies MarketError);
}
