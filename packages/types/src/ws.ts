import type { MarketRegime } from './market';
import type { Notification } from './notification';
import type { PositionStatus } from './portfolio';
import type { SignalAction } from './signal';

/** README §8.3 — one payload type per server → client event. */
export interface QuoteUpdatePayload {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: string;
}

export interface SignalNewPayload {
  signalId: string;
  symbol: string;
  action: SignalAction;
  score: number;
}

export interface SignalChangedPayload {
  signalId: string;
  changes: Record<string, unknown>;
}

export interface AnalysisUpdatedPayload {
  symbol: string;
  assessment: Record<string, unknown>;
}

export interface NotificationNewPayload {
  notification: Notification;
}

export interface PositionUpdatePayload {
  positionId: string;
  status: PositionStatus;
  unrealizedPnl: number;
}

export interface RegimeChangedPayload {
  symbol: string;
  regime: MarketRegime;
}

export interface WebSocketEventPayloads {
  'quote:update': QuoteUpdatePayload;
  'signal:new': SignalNewPayload;
  'signal:changed': SignalChangedPayload;
  'analysis:updated': AnalysisUpdatedPayload;
  'notification:new': NotificationNewPayload;
  'position:update': PositionUpdatePayload;
  'regime:changed': RegimeChangedPayload;
}

export type WebSocketEventNameTyped = keyof WebSocketEventPayloads;

export type TypedWebSocketEvent<K extends WebSocketEventNameTyped = WebSocketEventNameTyped> = {
  [P in K]: {
    event: P;
    data: WebSocketEventPayloads[P];
    timestamp: string;
    requestId?: string;
  };
}[K];
