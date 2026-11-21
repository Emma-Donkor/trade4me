import { z, type ZodType } from 'zod';
import { ERROR_CODES } from './common.schema';

export interface OpenApiSchemaObject {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  example?: unknown;
  [key: string]: unknown;
}

export interface OpenApiResponseObject {
  description: string;
  content: Record<string, { schema: OpenApiSchemaObject }>;
}

/**
 * Derives Swagger schemas from the same Zod source used for runtime validation,
 * so docs cannot drift from what the API actually accepts (README §8.6).
 */
export function zodToOpenApi<T extends ZodType>(
  schema: T,
  meta: { description?: string; example?: unknown } = {},
): OpenApiSchemaObject {
  const generated = z.toJSONSchema(schema, { target: 'openapi-3.0' }) as OpenApiSchemaObject;
  return {
    ...generated,
    ...(meta.description === undefined ? {} : { description: meta.description }),
    ...(meta.example === undefined ? {} : { example: meta.example }),
  };
}

export function openApiJsonResponse<T extends ZodType>(
  schema: T,
  description: string,
): OpenApiResponseObject {
  return {
    description,
    content: { 'application/json': { schema: zodToOpenApi(schema) } },
  };
}

export function openApiErrorResponse(description: string): OpenApiResponseObject {
  const schema = z.strictObject({
    success: z.literal(false),
    error: z.strictObject({
      code: z.enum(ERROR_CODES),
      message: z.string(),
      requestId: z.string(),
    }),
  });
  return openApiJsonResponse(schema, description);
}
