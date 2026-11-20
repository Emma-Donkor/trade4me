import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { envSchema, type Env } from '@ts/config';

/** Re-validates a source object; the same schema powers the Python parity test. */
export function validateConfiguration(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

/** DTO validation failures use the documented VALIDATION_ERROR code. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors) =>
      new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.map((error) => ({
          field: error.property,
          constraints: Object.values(error.constraints ?? {}),
        })),
      }),
  });
}
