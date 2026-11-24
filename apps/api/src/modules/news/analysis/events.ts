import type { NewsEventType, NewsImpact } from '@ts/types';
import { classifyText } from './classifier';

export const EVENT_CLASSES = [
  'RATES',
  'INFLATION',
  'GDP',
  'EMPLOYMENT',
  'CENTRAL_BANK',
  'POLICY',
  'GEOPOLITICAL',
  'RELEASE',
] as const;

export type EconomicEventClass = (typeof EVENT_CLASSES)[number];

/** README §11.2 — a HIGH/EXTREME release inside this window blocks new risk. */
export const IMMINENT_WINDOW_MINUTES = 60;

const EVENT_CLASS_BY_TYPE: Readonly<Record<NewsEventType, EconomicEventClass>> = {
  INTEREST_RATES: 'RATES',
  INFLATION: 'INFLATION',
  GDP: 'GDP',
  EMPLOYMENT: 'EMPLOYMENT',
  CENTRAL_BANK: 'CENTRAL_BANK',
  GOVERNMENT_POLICY: 'POLICY',
  GEOPOLITICAL: 'GEOPOLITICAL',
  ECONOMIC_RELEASE: 'RELEASE',
};

export function eventClassFor(type: NewsEventType): EconomicEventClass {
  return EVENT_CLASS_BY_TYPE[type];
}

/** Classify a calendar entry name with the same taxonomy used for articles. */
export function detectEventClass(name: string): EconomicEventClass {
  return eventClassFor(classifyText(name).eventType);
}

export interface EventProximity {
  minutesUntil: number;
  imminent: boolean;
}

export function eventProximity(
  scheduledAt: Date | string,
  now: Date | string = new Date(),
): EventProximity {
  const target = new Date(scheduledAt).getTime();
  const current = new Date(now).getTime();
  const minutesUntil = Math.round((target - current) / 60_000);
  return {
    minutesUntil,
    imminent: minutesUntil >= 0 && minutesUntil <= IMMINENT_WINDOW_MINUTES,
  };
}

export function isHighImpact(impact: NewsImpact): boolean {
  return impact === 'HIGH' || impact === 'EXTREME';
}
