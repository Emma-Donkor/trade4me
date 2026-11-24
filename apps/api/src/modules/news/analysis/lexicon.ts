import type { NewsEventType, NewsImpact } from '@ts/types';

/** README §11.2 — article text is untrusted and bounded before any use. */
export const MAX_TEXT_CHARS = 4000;

/**
 * Injection phrases are matched case-insensitively and replaced with inert
 * text. Patterns are deliberately non-global: callers clone with `g` when they
 * need a redaction count, so `RegExp.lastIndex` can never leak between calls.
 */
export const INJECTION_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions\b/i,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\b/i,
  /\byou\s+are\s+now\b/i,
  /\bsystem\s*:/i,
  /\bdeveloper\s+message\s*:/i,
  /\breveal\s+(?:your|the)\s+(?:system|developer)\s+prompt\b/i,
  /\bpretend\s+to\s+be\b/i,
  /\bnew\s+instructions\s*:/i,
];

export interface EventRule {
  readonly type: NewsEventType;
  readonly patterns: readonly RegExp[];
}

/** Event taxonomy from README §11.1. Order is only a stable tie-break. */
export const EVENT_RULES: readonly EventRule[] = [
  {
    type: 'INTEREST_RATES',
    patterns: [
      /\binterest\s+rates?\b/i,
      /\brate\s+(?:hike|cut|decision|increase|reduction)\b/i,
      /\bbasis\s+points?\b/i,
      /\bfed\s+funds?\b/i,
      /\bhawkish\b/i,
      /\bdovish\b/i,
    ],
  },
  {
    type: 'INFLATION',
    patterns: [
      /\binflation\b/i,
      /\b(?:cpi|pce|hicp)\b/i,
      /\bprice\s+(?:index|pressures?)\b/i,
      /\bconsumer\s+prices?\b/i,
    ],
  },
  {
    type: 'GDP',
    patterns: [
      /\bgdp\b/i,
      /\bgross\s+domestic\s+product\b/i,
      /\beconomic\s+growth\b/i,
      /\brecession\b/i,
    ],
  },
  {
    type: 'EMPLOYMENT',
    patterns: [
      /\bunemployment\b/i,
      /\bpayrolls?\b/i,
      /\bnonfarm\b/i,
      /\b(?:jobs|employment)\s+(?:report|data|growth|numbers?)\b/i,
      /\bjobless\s+claims\b/i,
    ],
  },
  {
    type: 'CENTRAL_BANK',
    patterns: [
      /\bcentral\s+bank\b/i,
      /\b(?:fed|federal\s+reserve|ecb|boe|boj|rba|rbnz|snb)\b/i,
      /\bmonetary\s+policy\b/i,
      /\bquantitative\s+(?:easing|tightening)\b/i,
    ],
  },
  {
    type: 'GOVERNMENT_POLICY',
    patterns: [
      /\bfiscal\b/i,
      /\bgovernment\s+(?:budget|spending|policy|stimulus)\b/i,
      /\btariffs?\b/i,
      /\btax(?:es|ation)?\b/i,
      /\bvote\s+of\s+confidence\b/i,
    ],
  },
  {
    type: 'GEOPOLITICAL',
    patterns: [
      /\bgeopolitic\w*\b/i,
      /\bwar\b/i,
      /\bconflict\b/i,
      /\bsanctions?\b/i,
      /\belections?\b/i,
      /\bceasefire\b/i,
      /\binvasion\b/i,
    ],
  },
];

export interface WeightedTerm {
  readonly pattern: RegExp;
  readonly weight: number;
}

/** Signed financial sentiment lexicon; each term contributes at most once. */
export const BULLISH_TERMS: readonly WeightedTerm[] = [
  { pattern: /\bstrong(?:er|est)?\b/i, weight: 2 },
  { pattern: /\bgrowth\b/i, weight: 2 },
  { pattern: /\bexpansion\b/i, weight: 2 },
  { pattern: /\bbeat(?:s|ing)?\b/i, weight: 2 },
  { pattern: /\babove\s+(?:forecast|expectations?)\b/i, weight: 2 },
  { pattern: /\bhawkish\b/i, weight: 1 },
  { pattern: /\brise[sn]?\b/i, weight: 1 },
  { pattern: /\brebound\b/i, weight: 2 },
  { pattern: /\boptimis\w+\b/i, weight: 1 },
  { pattern: /\bpositive\b/i, weight: 1 },
];

export const BEARISH_TERMS: readonly WeightedTerm[] = [
  { pattern: /\bweak(?:er|est)?\b/i, weight: 2 },
  { pattern: /\brecession\b/i, weight: 2 },
  { pattern: /\bcontraction\b/i, weight: 2 },
  { pattern: /\bmiss(?:es|ed|ing)?\b/i, weight: 2 },
  { pattern: /\bbelow\s+(?:forecast|expectations?)\b/i, weight: 2 },
  { pattern: /\bdovish\b/i, weight: 1 },
  { pattern: /\bfall[sn]?\b/i, weight: 1 },
  { pattern: /\bslowdown\b/i, weight: 2 },
  { pattern: /\bpessimis\w+\b/i, weight: 1 },
  { pattern: /\bnegative\b/i, weight: 1 },
];

/** Urgency language raises impact independently of directional sentiment. */
export const URGENT_PATTERNS: readonly RegExp[] = [
  /\burgent(?:ly)?\b/i,
  /\bbreaking\b/i,
  /\bimmediate(?:ly)?\b/i,
  /\bemergency\b/i,
  /\bcrisis\b/i,
  /\bshock\b/i,
  /\bsurprise[sd]?\b/i,
  /\bunprecedented\b/i,
];

export const HIGH_IMPACT_EVENT_TYPES: readonly NewsEventType[] = [
  'INTEREST_RATES',
  'CENTRAL_BANK',
  'INFLATION',
  'EMPLOYMENT',
  'GEOPOLITICAL',
];

/** Named institutions map to their home currency for entity extraction. */
export const INSTITUTION_CURRENCIES: Readonly<Record<string, string>> = {
  fed: 'USD',
  'federal reserve': 'USD',
  ecb: 'EUR',
  'european central bank': 'EUR',
  boe: 'GBP',
  'bank of england': 'GBP',
  boj: 'JPY',
  'bank of japan': 'JPY',
  rba: 'AUD',
  'reserve bank of australia': 'AUD',
  boc: 'CAD',
  'bank of canada': 'CAD',
  rbnz: 'NZD',
  'reserve bank of new zealand': 'NZD',
  snb: 'CHF',
  'swiss national bank': 'CHF',
};

export const CURRENCY_NAMES: Readonly<Record<string, string>> = {
  euro: 'EUR',
  dollar: 'USD',
  'us dollar': 'USD',
  sterling: 'GBP',
  pound: 'GBP',
  yen: 'JPY',
  franc: 'CHF',
  'australian dollar': 'AUD',
  'canadian dollar': 'CAD',
  'new zealand dollar': 'NZD',
};

export const IMPACT_WEIGHT: Readonly<Record<NewsImpact, number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 4,
  EXTREME: 8,
};
