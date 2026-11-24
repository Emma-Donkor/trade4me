import { ProviderError } from './provider.errors';
import type { FetchLike, ProviderPairContext } from './provider.interface';

/** Canonical symbol → provider symbol from CurrencyPair.providerSymbols. */
export function mappedSymbol(
  symbol: string,
  context: ProviderPairContext | undefined,
  provider: string,
  transform?: (value: string) => string,
): string {
  const mapping = context?.providerSymbols?.[provider];
  const mapped = typeof mapping === 'string' && mapping.trim().length > 0 ? mapping.trim() : symbol;
  return transform ? transform(mapped) : mapped;
}

export function currencyCodes(symbol: string): { from: string; to: string } {
  const normalised = symbol.replace(/[/_-]/g, '').toUpperCase();
  if (normalised.length < 6) {
    throw new ProviderError('malformed', 'Provider symbol is not a currency pair');
  }
  return { from: normalised.slice(0, 3), to: normalised.slice(-3) };
}

export interface FetchJsonOptions {
  fetcher: FetchLike;
  provider: string;
  timeoutMs?: number;
}

/**
 * Fetches JSON with a hard timeout. URLs (which contain API keys) are never
 * included in errors or logs.
 */
export async function fetchProviderJson(
  url: string,
  { fetcher, provider, timeoutMs = 5_000 }: FetchJsonOptions,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        /timeout/i.test(error.message));
    if (timedOut) throw new ProviderError('timeout', `Provider ${provider} timed out`);
    throw new ProviderError('unavailable', `Provider ${provider} is unreachable`);
  }

  if (!response.ok) {
    const kind = response.status === 429 ? 'quota' : 'http';
    throw new ProviderError(kind, `Provider ${provider} returned HTTP ${response.status}`, {
      details: { status: response.status },
    });
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderError('malformed', `Provider ${provider} returned invalid JSON`);
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
