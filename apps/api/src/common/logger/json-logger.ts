import { Injectable, type LoggerService } from '@nestjs/common';
import { env } from '@ts/config';
import { redact } from './redact';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function configuredLevel(): LogLevel {
  const level = String(env.LOG_LEVEL ?? 'info').toLowerCase();
  return level === 'error' || level === 'warn' || level === 'debug' ? level : 'info';
}

/** Structured JSON logger shared by HTTP, workers, queues and the WS gateway. */
@Injectable()
export class JsonLogger implements LoggerService {
  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[configuredLevel()]) return;

    const entry = {
      time: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : redact(message),
      ...(context ? { context } : {}),
      ...((redact(extra ?? {}) as Record<string, unknown>) ?? {}),
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }

  log(message: unknown, context?: string, extra?: Record<string, unknown>): void {
    this.write('info', message, context, extra);
  }

  error(
    message: unknown,
    trace?: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    this.write('error', message, context, {
      ...(typeof trace === 'string' ? { trace } : {}),
      ...extra,
    });
  }

  warn(message: unknown, context?: string, extra?: Record<string, unknown>): void {
    this.write('warn', message, context, extra);
  }

  debug(message: unknown, context?: string, extra?: Record<string, unknown>): void {
    this.write('debug', message, context, extra);
  }

  verbose(message: unknown, context?: string, extra?: Record<string, unknown>): void {
    this.write('debug', message, context, extra);
  }
}
