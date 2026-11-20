import type { Server, Socket } from 'socket.io';
import { JsonLogger } from '../../common/logger/json-logger';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from './gateway';

describe('EventsGateway', () => {
  it('emits the documented WebSocket event envelope', () => {
    const redis = {
      getPublisher: jest.fn(),
      getSubscriber: jest.fn(),
    } as unknown as RedisService;
    const gateway = new EventsGateway(redis, new JsonLogger());
    const emit = jest.fn();
    gateway.server = { emit } as unknown as Server;

    gateway.emit('quote:update', { symbol: 'EUR/USD', bid: 1.08, ask: 1.0801 }, 'req_1');

    expect(emit).toHaveBeenCalledWith(
      'quote:update',
      expect.objectContaining({
        event: 'quote:update',
        data: { symbol: 'EUR/USD', bid: 1.08, ask: 1.0801 },
        requestId: 'req_1',
        timestamp: expect.any(String),
      }),
    );
  });

  it('installs the Redis adapter on the Socket.IO server', () => {
    const redis = {
      getPublisher: jest.fn(() => ({})),
      getSubscriber: jest.fn(() => ({})),
    } as unknown as RedisService;
    const gateway = new EventsGateway(redis, new JsonLogger());
    const server = { emit: jest.fn(), adapter: undefined } as unknown as Server;

    gateway.afterInit(server);

    expect(redis.getPublisher).toHaveBeenCalled();
    expect(redis.getSubscriber).toHaveBeenCalled();
    expect(server.adapter).toBeDefined();
  });

  it('accepts a dev handshake without a token and assigns a dev user', () => {
    const gateway = new EventsGateway({} as RedisService, new JsonLogger());
    const client = {
      handshake: { auth: {}, headers: {} },
      data: {},
      disconnect: jest.fn(),
    } as unknown as Socket;

    gateway.handleConnection(client);

    expect(client.data.user).toEqual({ id: 'dev-user', roles: [] });
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
