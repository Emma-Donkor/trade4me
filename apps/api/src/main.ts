import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { MONOREPO_ROOT_PACKAGE } from '@ts/types';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger/json-logger';
import { createApiDocument } from './common/openapi/openapi';
import { configuration } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(JsonLogger));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );
  // P06: the rotating refresh token travels in an httpOnly cookie.
  app.use(cookieParser());
  app.enableCors({ origin: configuration.cors.origins, credentials: true });
  // Trust only the configured number of reverse-proxy hops. Without this,
  // every client shares the proxy address and one rate-limit bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', configuration.trustProxy);
  app.setGlobalPrefix('api/v1');

  SwaggerModule.setup('api/v1/docs', app, createApiDocument(app));

  app.enableShutdownHooks();
  await app.listen(configuration.app.port);

  const base = `http://localhost:${configuration.app.port}`;
  console.log(`${MONOREPO_ROOT_PACKAGE} API listening on ${base}/api/v1/health`);
  console.log(`${MONOREPO_ROOT_PACKAGE} API docs at ${base}/api/v1/docs`);
}

void bootstrap();
