import type { Request } from 'express';

/**
 * Express resolves `req.ip` from X-Forwarded-For only when `trust proxy` is
 * configured. Every rate limiter and audit context must use this single helper
 * so production and tests derive the client identity identically.
 */
export function clientIp(request: Request): string {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}
