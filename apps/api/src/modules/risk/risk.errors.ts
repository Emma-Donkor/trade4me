import { UnprocessableEntityException } from '@nestjs/common';
import type { ErrorCode } from '@ts/types';

interface RiskError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** README §8.4 — a blocked order is a structured, machine-readable 422. */
export function noTradeRuleViolation(details: Record<string, unknown>): never {
  throw new UnprocessableEntityException({
    code: 'NO_TRADE_RULE_VIOLATION',
    message: 'Order blocked by risk rules',
    details,
  } satisfies RiskError);
}
