import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import type { ApiSuccess } from '@ts/types';
import type { RequestWithId } from './request-id.interceptor';

/** Wraps successful HTTP payloads in the README §8.1 success envelope. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithId & Request>();

    return next.handle().pipe(
      map((data: unknown) => {
        if (data && typeof data === 'object' && 'success' in data) return data;
        const body: ApiSuccess<unknown> = {
          success: true,
          data: data ?? null,
          requestId: request.requestId ?? 'req_unknown',
        };
        return body;
      }),
    );
  }
}
