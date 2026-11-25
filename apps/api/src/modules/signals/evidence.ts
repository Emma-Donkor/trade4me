import type { EvidenceItem } from '@ts/types';
import type { ComponentScore } from './scoring/component';

export interface AssembledEvidence {
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
}

function keyOf(item: EvidenceItem): string {
  return `${item.source}|${item.claim}|${String(item.value)}`;
}

function unique(items: readonly EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Contradicting evidence is never filtered out: P17 must be able to explain
 * the downside of a signal as faithfully as its upside.
 */
export function assembleEvidence(
  components: readonly ComponentScore[],
  extra: AssembledEvidence = { supporting: [], contradicting: [] },
): AssembledEvidence {
  return {
    supporting: unique([...extra.supporting, ...components.flatMap((item) => item.supporting)]),
    contradicting: unique([
      ...extra.contradicting,
      ...components.flatMap((item) => item.contradicting),
    ]),
  };
}

/** Every emitted action must be traceable to at least one structured claim. */
export function withFallbackEvidence(
  evidence: AssembledEvidence,
  item: EvidenceItem,
): AssembledEvidence {
  if (evidence.supporting.length > 0 || evidence.contradicting.length > 0) return evidence;
  return { supporting: [item], contradicting: [] };
}
