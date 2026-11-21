import {
  NotImplementedException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ErrorCode } from '@ts/types';

interface StubError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Every Phase 7 stub fails with a documented code; none fabricates domain rows. */
export function notImplemented(feature: string): never {
  throw new NotImplementedException({
    code: 'NOT_IMPLEMENTED',
    message: `${feature} is not implemented yet`,
    details: { feature },
  } satisfies StubError);
}

export function insufficientData(resource: string, details?: Record<string, unknown>): never {
  throw new UnprocessableEntityException({
    code: 'INSUFFICIENT_DATA',
    message: `Not enough data is available for ${resource}`,
    details: { resource, ...details },
  } satisfies StubError);
}

export function aiUnavailable(feature: string): never {
  throw new ServiceUnavailableException({
    code: 'AI_SERVICE_UNAVAILABLE',
    message: `AI service is unavailable for ${feature}`,
    details: { feature },
  } satisfies StubError);
}
