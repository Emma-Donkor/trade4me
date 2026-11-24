import { describe, expect, it, jest } from '@jest/globals';
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

  it('connects lazy pub/sub clients before installing the Redis adapter', async () => {
    const redis = {
      ensureConnected: jest.fn(async () => undefined),
      getPublisher: jest.fn(() => ({})),
      getSubscriber: jest.fn(() => ({})),
    } as unknown as RedisService;
    const gateway = new EventsGateway(redis, new JsonLogger());
    // Nest supplies a Namespace for `/`; the root Server owns `adapter()`.
    const io = { adapter: jest.fn() };
    const server = { emit: jest.fn(), server: io } as unknown as Server;

    await gateway.onModuleInit();
    gateway.afterInit(server);

    expect(redis.ensureConnected).toHaveBeenCalledTimes(1);
    expect(redis.getPublisher).toHaveBeenCalled();
    expect(redis.getSubscriber).toHaveBeenCalled();
    expect(io.adapter).toHaveBeenCalledTimes(1);
    expect(typeof io.adapter.mock.calls[0][0]).toBe('function');
  });

  it('starts without a shared adapter when Redis is unavailable', async () => {
    const redis = {
      ensureConnected: jest.fn(async () => {
        throw new Error('redis down');
      }),
      getPublisher: jest.fn(),
      getSubscriber: jest.fn(),
    } as unknown as RedisService;
    const logger = { warn: jest.fn() } as unknown as JsonLogger;
    const gateway = new EventsGateway(redis, logger);
    const io = { adapter: jest.fn() };
    const server = { emit: jest.fn(), server: io } as unknown as Server;

    await gateway.onModuleInit();
    gateway.afterInit(server);

    expect(io.adapter).not.toHaveBeenCalled();
    expect(redis.getPublisher).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis pub/sub unavailable'),
      'WS',
    );
  });

  it('rejects a handshake without a token in every environment', async () => {
    const gateway = new EventsGateway({} as RedisService, new JsonLogger());
    const client = {
      handshake: { auth: {}, headers: {} },
      data: {},
      disconnect: jest.fn(),
    } as unknown as Socket;

    await gateway.handleConnection(client);

    expect(client.data.user).toBeUndefined();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
