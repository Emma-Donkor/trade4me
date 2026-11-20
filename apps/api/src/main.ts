import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { env } from '@ts/config';
import { MONOREPO_ROOT_PACKAGE } from '@ts/types';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  await app.listen(env.API_PORT);
  console.log(
    `${MONOREPO_ROOT_PACKAGE} API listening on http://localhost:${env.API_PORT}/api/v1/health`,
  );
}

void bootstrap();
