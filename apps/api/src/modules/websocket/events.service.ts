import { Injectable } from '@nestjs/common';
import type {
  AnalysisUpdatedPayload,
  NotificationNewPayload,
  PositionUpdatePayload,
  QuoteUpdatePayload,
  RegimeChangedPayload,
  SignalChangedPayload,
  SignalNewPayload,
  WebSocketEventNameTyped,
  WebSocketEventPayloads,
} from '@ts/types';
import { EventsGateway } from './gateway';

/**
 * Phase 7 registers typed emitters for all README §8.3 events. No feature
 * module publishes yet; later phases inject this service instead of the raw
 * gateway so event names and payloads cannot drift.
 */
@Injectable()
export class EventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emit<K extends WebSocketEventNameTyped>(
    event: K,
    data: WebSocketEventPayloads[K],
    requestId?: string,
  ): void {
    this.gateway.emit(event, data, requestId);
  }

  quoteUpdate(data: QuoteUpdatePayload, requestId?: string): void {
    this.emit('quote:update', data, requestId);
  }

  signalNew(data: SignalNewPayload, requestId?: string): void {
    this.emit('signal:new', data, requestId);
  }

  signalChanged(data: SignalChangedPayload, requestId?: string): void {
    this.emit('signal:changed', data, requestId);
  }

  analysisUpdated(data: AnalysisUpdatedPayload, requestId?: string): void {
    this.emit('analysis:updated', data, requestId);
  }

  notificationNew(data: NotificationNewPayload, requestId?: string): void {
    this.emit('notification:new', data, requestId);
  }

  positionUpdate(data: PositionUpdatePayload, requestId?: string): void {
    this.emit('position:update', data, requestId);
  }

  regimeChanged(data: RegimeChangedPayload, requestId?: string): void {
    this.emit('regime:changed', data, requestId);
  }
}
