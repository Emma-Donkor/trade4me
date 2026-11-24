import { CURRENCY_NAMES, INSTITUTION_CURRENCIES } from './lexicon';

export const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

const CODE_ALTERNATION = CURRENCY_CODES.join('|');
const CODE_BOUNDARY = new RegExp(`\\b(${CODE_ALTERNATION})\\b`, 'g');
const PAIR_PATTERN = new RegExp(`\\b(${CODE_ALTERNATION})\\s*/\\s*(${CODE_ALTERNATION})\\b`, 'g');

/**
 * Extract ISO currency codes from explicit notation, pair notation and named
 * institutions. All matches are alphabetical so output is deterministic.
 */
export function extractCurrencies(text: string): string[] {
  const upper = String(text ?? '').toUpperCase();
  const found = new Set<string>();

  for (const match of upper.matchAll(PAIR_PATTERN)) {
    found.add(match[1]);
    found.add(match[2]);
  }
  for (const match of upper.matchAll(CODE_BOUNDARY)) found.add(match[1]);

  for (const [name, code] of Object.entries(INSTITUTION_CURRENCIES)) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      found.add(code);
    }
  }
  for (const [name, code] of Object.entries(CURRENCY_NAMES)) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      found.add(code);
    }
  }

  return [...found].sort();
}

/** Map the extracted currencies onto the active pairs known to the platform. */
export function pairsForCurrencies(
  currencies: readonly string[],
  knownPairs: readonly string[],
): string[] {
  const present = new Set(currencies);
  return knownPairs
    .filter((symbol) => {
      const [base, quote] = symbol.split('/');
      return present.has(base) && present.has(quote);
    })
    .map((symbol) => symbol.trim())
    .sort();
}
