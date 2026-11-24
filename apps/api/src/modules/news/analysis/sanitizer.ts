import { createHash } from 'node:crypto';
import type { NewsSafety } from '@ts/types';
import { INJECTION_PATTERNS, MAX_TEXT_CHARS } from './lexicon';

const MARKER_START = '[P11_SAFETY:';
const MARKER_PATTERN = /\[P11_SAFETY:([^\]]+)\]\s*$/;

export interface SanitizedText {
  text: string;
  safety: NewsSafety;
}

const CLEAN_SAFETY: NewsSafety = {
  injectionAttempted: false,
  redactions: 0,
  truncated: false,
};

/**
 * README §11.2: external text is data, never instructions. Markup is removed,
 * the string is bounded, and known prompt-injection phrases become the inert
 * literal `[redacted]`. The raw body is never rendered as HTML downstream.
 */
export function sanitizeText(input: string | null | undefined): SanitizedText {
  let text = String(input ?? '');
  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS);
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex -- scrub control characters from untrusted feeds
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\s+/g, ' ')
    .trim();

  let redactions = 0;
  for (const pattern of INJECTION_PATTERNS) {
    const global = new RegExp(pattern.source, `${pattern.flags}g`);
    const before = text;
    const matches = before.match(global)?.length ?? 0;
    if (matches > 0) {
      text = before.replace(global, '[redacted]');
      redactions += matches;
    }
  }

  return {
    text,
    safety: {
      injectionAttempted: redactions > 0,
      redactions,
      truncated,
    },
  };
}

/**
 * Persist the scrubbed text plus a machine-readable safety marker in the
 * existing `rawText` column. No schema change is needed and the marker is
 * inert plain text, so a future LLM reader can still see the flag.
 */
export function encodeStoredText(sanitized: SanitizedText): string {
  const marker = `${MARKER_START}${JSON.stringify(sanitized.safety)}]`;
  return sanitized.text.length > 0 ? `${sanitized.text}\n${marker}` : marker;
}

export function decodeStoredText(stored: string | null | undefined): SanitizedText {
  const raw = String(stored ?? '');
  const match = MARKER_PATTERN.exec(raw);
  if (match === null) return { text: raw, safety: CLEAN_SAFETY };
  try {
    const parsed = JSON.parse(match[1]) as Partial<NewsSafety>;
    return {
      text: raw.slice(0, match.index).trim(),
      safety: {
        injectionAttempted: parsed.injectionAttempted === true,
        redactions: Number(parsed.redactions) || 0,
        truncated: parsed.truncated === true,
      },
    };
  } catch {
    return { text: raw, safety: CLEAN_SAFETY };
  }
}

/** Stable dedupe key for identical content republished under a new URL. */
export function contentHash(parts: readonly (string | undefined)[]): string {
  const normalised = parts
    .map((part) =>
      String(part ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
    )
    .join('|');
  return createHash('sha256').update(normalised).digest('hex');
}
