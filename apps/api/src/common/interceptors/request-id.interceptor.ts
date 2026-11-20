import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { env } from '@ts/config';

export type RequestWithId = Request & { requestId?: string };

/**
 * Correlates every request with a requestId. Incoming x-request-id values are
 * preserved so the ID survives gateways and the AI service hop.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0 ? incoming : `req_${randomUUID()}`;

    request.requestId = requestId;
    if (String(env.ENABLE_REQUEST_IDS) !== 'false') {
      response.setHeader('x-request-id', requestId);
    }
    return next.handle();
  }
}
