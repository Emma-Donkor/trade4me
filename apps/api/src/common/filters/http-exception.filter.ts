import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiError } from '@ts/types';
import { redact } from '../logger/redact';
import type { RequestWithId } from '../interceptors/request-id.interceptor';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

function detailsOf(exception: HttpException): unknown | undefined {
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null) return undefined;
  const body = response as Record<string, unknown>;
  if (Array.isArray(body.message)) return body.message;
  if ('details' in body) return body.details;
  return undefined;
}

function codeOf(exception: HttpException, status: number): string {
  const response = exception.getResponse();
  if (typeof response === 'object' && response !== null) {
    const code = (response as Record<string, unknown>).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return CODE_BY_STATUS[status] ?? 'HTTP_ERROR';
}

/** Maps every thrown error to the documented error envelope, without stacks. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = isHttp ? codeOf(exception, status) : 'INTERNAL_ERROR';
    const message = isHttp
      ? exception.message
      : status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : 'Request failed';
    const details = isHttp ? redact(detailsOf(exception)) : undefined;
    const requestId =
      request?.requestId ??
      (typeof request?.headers?.['x-request-id'] === 'string'
        ? (request.headers['x-request-id'] as string)
        : `req_${randomUUID()}`);

    const body: ApiError = {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        requestId,
      },
    };

    response.status(status).json(body);
  }
}
