import { describe, expect, it, jest } from '@jest/globals';
import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@ts/types';
import { HttpExceptionFilter } from './http-exception.filter';
import type { RequestWithId } from '../interceptors/request-id.interceptor';

function fakeHost(request: RequestWithId) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('maps an unknown error to 500 INTERNAL_ERROR without leaking a stack', () => {
    const request = { headers: {}, requestId: 'req_test_1' } as unknown as RequestWithId;
    const { host, response } = fakeHost(request);

    filter.catch(new Error('database password at db.internal'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0][0] as ApiError;
    expect(body.success).toBe(false);
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req_test_1',
    });
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('maps known HTTP exceptions to documented codes and redacts details', () => {
    const request = { headers: { 'x-request-id': 'req_test_2' } } as unknown as Request &
      RequestWithId;
    const { host, response } = fakeHost(request);

    filter.catch(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { apiKey: 'super-secret', field: 'symbol' },
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0] as ApiError;
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    expect(body.error?.requestId).toBe('req_test_2');
    expect(JSON.stringify(body.error?.details)).toContain('[REDACTED]');
    expect(JSON.stringify(body.error?.details)).not.toContain('super-secret');
  });

  it('falls back to a status-derived code for plain HttpExceptions', () => {
    const { host, response } = fakeHost({ headers: {} } as unknown as RequestWithId);
    filter.catch(new HttpException('nope', 403), host);
    const body = response.json.mock.calls[0][0] as ApiError;
    expect(response.status).toHaveBeenCalledWith(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });
});
