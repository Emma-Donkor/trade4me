import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApiDocument } from './common/openapi/openapi';
import { OpenApiModule } from './common/openapi/openapi.module';

/** `npm run openapi:export` writes the generated README-contract spec. */
export async function exportOpenApi(
  output = resolve(process.cwd(), 'docs/openapi.json'),
): Promise<string> {
  const app = await NestFactory.create(OpenApiModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const document = createApiDocument(app);
  await app.close();
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return output;
}

if (require.main === module) {
  void exportOpenApi()
    .then((path) => {
      console.log(`OpenAPI exported to ${path}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
