import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { RequestIdInterceptor } from '../../common/interceptors/request-id.interceptor';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { JsonLogger } from '../../common/logger/json-logger';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { createValidationPipe } from '../../config/validation';
import { HealthController } from './health.controller';
import { HEALTH_SERVICE, type ReadinessResult } from './health.service';

describe('health HTTP contract', () => {
  let app: INestApplication;
  const readiness: ReadinessResult = {
    status: 'degraded',
    dependencies: {
      redis: { status: 'up', latencyMs: 1, error: null },
      database: { status: 'down', latencyMs: 2, error: 'no client' },
      ai: { status: 'up', latencyMs: 3, error: null },
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        JsonLogger,
        {
          provide: HEALTH_SERVICE,
          useValue: { liveness: () => ({ status: 'ok' }), readiness: () => readiness },
        },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
        { provide: APP_PIPE, useFactory: (): ValidationPipe => createValidationPipe() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns the success envelope with a requestId', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok' },
      requestId: expect.stringMatching(/^req_/),
    });
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  it('GET /health/ready reports each dependency', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(readiness);
    expect(response.body.data.dependencies.database.status).toBe('down');
  });
});
