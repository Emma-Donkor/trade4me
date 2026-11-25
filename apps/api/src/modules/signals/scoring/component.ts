import type { Direction, EvidenceItem, NoTradeReason } from '@ts/types';

export interface ComponentScore {
  score: number;
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  reasons: NoTradeReason[];
  direction?: Direction;
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

export function evidence(
  source: string,
  claim: string,
  value: EvidenceItem['value'],
): EvidenceItem {
  return { source, claim, value };
}

export function component(
  score: number,
  supporting: EvidenceItem[] = [],
  contradicting: EvidenceItem[] = [],
  reasons: NoTradeReason[] = [],
  direction?: Direction,
): ComponentScore {
  return {
    score: clampScore(score),
    supporting,
    contradicting,
    reasons,
    ...(direction === undefined ? {} : { direction }),
  };
}
