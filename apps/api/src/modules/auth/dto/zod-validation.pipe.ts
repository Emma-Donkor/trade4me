import { Injectable, UnprocessableEntityException, type PipeTransform } from '@nestjs/common';
import type { z } from '@ts/validation';

/**
 * P06 bridge: controller DTOs are validated by the same Zod schemas used by
 * the frontend, so unknown keys and weak inputs never reach a service.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;

    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}
