/** README §9.2 error taxonomy: quota, timeout, malformed, rate-limit and more. */
export type ProviderErrorKind =
  | 'quota'
  | 'timeout'
  | 'rate_limited'
  | 'malformed'
  | 'http'
  | 'invalid_timestamp'
  | 'unsupported'
  | 'disabled'
  | 'unavailable'
  | 'unknown';

const NON_RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  'malformed',
  'invalid_timestamp',
  'unsupported',
  'disabled',
]);

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly details: Record<string, unknown>;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { retryAfterMs?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.retryable = !NON_RETRYABLE.has(kind);
    this.retryAfterMs = options.retryAfterMs;
    // Never place URLs, keys or raw provider bodies here: details are logged.
    this.details = options.details ?? {};
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

export type TimestampRejectionReason = 'future' | 'out-of-order' | 'invalid';

/** Prefer the validator's explicit reason; keep a message fallback for adapters. */
export function timestampRejectionReason(error: ProviderError): TimestampRejectionReason {
  const { reason } = error.details;
  if (reason === 'future' || reason === 'out-of-order') return reason;
  if (/future/i.test(error.message)) return 'future';
  if (/out-of-order/i.test(error.message)) return 'out-of-order';
  return 'invalid';
}
