import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { JsonLogger } from '../logger/json-logger';
import type { RequestWithId } from './request-id.interceptor';

/** Emits one structured JSON line per completed HTTP request. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(JsonLogger) private readonly logger: JsonLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    response.on('finish', () => {
      this.logger.log(`${request.method} ${request.originalUrl} ${response.statusCode}`, 'HTTP', {
        requestId: request.requestId ?? 'req_unknown',
        durationMs: Date.now() - startedAt,
        method: request.method,
        url: request.originalUrl,
        statusCode: response.statusCode,
        query: request.query,
        body: request.body,
      });
    });

    return next.handle();
  }
}
