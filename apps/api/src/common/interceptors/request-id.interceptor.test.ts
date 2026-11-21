import { describe, expect, it, jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of } from 'rxjs';
import { RequestIdInterceptor, type RequestWithId } from './request-id.interceptor';

function contextFor(request: RequestWithId) {
  const response = { setHeader: jest.fn() } as unknown as Response;
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, response };
}

describe('RequestIdInterceptor', () => {
  const interceptor = new RequestIdInterceptor();

  it('propagates an incoming x-request-id and sets the response header', (done) => {
    const request = { headers: { 'x-request-id': 'req_from_gateway' } } as unknown as Request &
      RequestWithId;
    const { context, response } = contextFor(request);

    interceptor.intercept(context, { handle: () => of({ ok: true }) }).subscribe(() => {
      expect(request.requestId).toBe('req_from_gateway');
      expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'req_from_gateway');
      done();
    });
  });

  it('generates a req_ id when the caller did not send one', (done) => {
    const request = { headers: {} } as unknown as RequestWithId;
    const { context, response } = contextFor(request);

    interceptor.intercept(context, { handle: () => of(null) }).subscribe(() => {
      expect(request.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
      expect(response.setHeader).toHaveBeenCalledWith('x-request-id', request.requestId);
      done();
    });
  });
});
