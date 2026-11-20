import { JsonLogger } from '../../common/logger/json-logger';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('buffers redacted entries for the PHASE 04 persistence worker', async () => {
    const logger = new JsonLogger();
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    const service = new AuditService(logger);

    await service.record({
      actorId: 'user-1',
      action: 'LOGIN',
      entity: 'User',
      metadata: { authorization: 'Bearer token', symbol: 'EUR/USD' },
      requestId: 'req_1',
    });

    const [entry] = service.drain();
    expect(entry.action).toBe('LOGIN');
    expect(entry.metadata).toEqual({ authorization: '[REDACTED]', symbol: 'EUR/USD' });
    expect(service.drain()).toEqual([]);
  });
});
