export const BACKOFF_BASE_MS = 200;
export const BACKOFF_CAP_MS = 2_000;

/**
 * Exponential backoff with bounded jitter. The jitter factor is [0.5, 1), so
 * concurrent workers never retry in lockstep while growth stays predictable.
 */
export function backoffDelayMs(
  attempt: number,
  random: () => number = Math.random,
  baseMs = BACKOFF_BASE_MS,
  capMs = BACKOFF_CAP_MS,
): number {
  const exponent = Math.max(0, Math.trunc(attempt));
  const exponential = Math.min(capMs, baseMs * 2 ** exponent);
  const jitter = 0.5 + Math.min(0.999_999, Math.max(0, random())) * 0.5;
  return Math.max(1, Math.round(exponential * jitter));
}

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export interface RetryOptions {
  retries?: number;
  random?: () => number;
  sleep?: Sleep;
  shouldRetry?: (error: unknown) => boolean;
}

/** Retries retryable provider failures only; caller controls failover. */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = Math.max(0, Math.trunc(options.retries ?? 1));
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? realSleep;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) break;
      await sleep(backoffDelayMs(attempt, random));
    }
  }
  throw lastError;
}
