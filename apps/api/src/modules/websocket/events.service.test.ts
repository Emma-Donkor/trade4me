import type { WebSocketEventName } from '@ts/types';
import { EventsService } from './events.service';
import type { EventsGateway } from './gateway';

describe('P07 WebSocket emitters', () => {
  it('registers all seven README events with typed envelopes', () => {
    const emit = jest.fn();
    const gateway = { emit } as unknown as EventsGateway;
    const events = new EventsService(gateway);

    events.quoteUpdate({ symbol: 'EUR/USD', bid: 1.1, ask: 1.1002, timestamp: 'now' });
    events.signalNew({ signalId: 'sig_1', symbol: 'EUR/USD', action: 'LONG', score: 80 });
    events.signalChanged({ signalId: 'sig_1', changes: { score: 75 } });
    events.analysisUpdated({ symbol: 'EUR/USD', assessment: {} });
    events.notificationNew({
      notification: {
        id: 'ntf_1',
        type: 'PRICE_ALERT',
        title: 'Alert',
        body: 'Price moved',
        payload: {},
        read: false,
        createdAt: 'now',
      },
    });
    events.positionUpdate({ positionId: 'pos_1', status: 'OPEN', unrealizedPnl: 10 });
    events.regimeChanged({ symbol: 'EUR/USD', regime: 'RANGE' }, 'req_1');

    expect(emit.mock.calls.map(([event]) => event)).toEqual<WebSocketEventName[]>([
      'quote:update',
      'signal:new',
      'signal:changed',
      'analysis:updated',
      'notification:new',
      'position:update',
      'regime:changed',
    ]);
    expect(emit).toHaveBeenLastCalledWith(
      'regime:changed',
      { symbol: 'EUR/USD', regime: 'RANGE' },
      'req_1',
    );
  });
});
