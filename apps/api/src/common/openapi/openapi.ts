import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { env } from '@ts/config';
import { ROUTE_CATALOG, catalogKey, normalizePath, type HttpMethod } from './route-catalog';

const METHODS: readonly HttpMethod[] = ['get', 'post', 'patch', 'delete'];

const ERROR_EXAMPLES = [
  { status: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid bearer token' },
  { status: 403, code: 'FORBIDDEN', message: 'Insufficient role' },
  {
    status: 422,
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: [{ field: 'email', message: 'Expected a valid email address' }],
  },
  {
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Too many requests',
    details: { limit: 100, windowSeconds: 60 },
  },
  { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' },
  { status: 501, code: 'NOT_IMPLEMENTED', message: 'Feature is not implemented yet' },
  { status: 503, code: 'AI_SERVICE_UNAVAILABLE', message: 'AI service is unavailable' },
] as const;

function operationRecord(operation: OperationObject): Record<string, unknown> {
  return operation as unknown as Record<string, unknown>;
}

function errorBody(code: string, message: string, details?: unknown): Record<string, unknown> {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: 'req_01Jexample',
    },
  };
}

function enrichOperation(operation: OperationObject, method: HttpMethod, path: string): void {
  const key = catalogKey(method, path);
  const spec = ROUTE_CATALOG.find((route) => catalogKey(route.method, route.path) === key);
  const record = operationRecord(operation);

  if (spec) {
    operation.summary = spec.summary;
    record['x-auth'] = spec.auth;
    if (spec.auth === 'ADMIN' || spec.auth === 'ANALYST') record['x-roles'] = [spec.auth];
    operation.security =
      spec.auth === 'Public'
        ? []
        : spec.auth === 'Cookie'
          ? [{ refreshCookie: [] }]
          : [{ bearer: [] }];

    const successStatus = spec.status ?? (method === 'post' ? 201 : 200);
    operation.responses[String(successStatus)] = {
      description: spec.summary,
      content: {
        'application/json': {
          example: {
            success: true,
            data: spec.dataExample ?? {},
            requestId: 'req_01Jexample',
          },
        },
      },
    };

    if (spec.requestExample !== undefined && method !== 'get' && method !== 'delete') {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object' },
            example: spec.requestExample,
          },
        },
      };
    }
  }

  for (const example of ERROR_EXAMPLES) {
    operation.responses[String(example.status)] = {
      description: example.code,
      ...(example.status === 429
        ? {
            headers: {
              'Retry-After': {
                description: 'Seconds until the current rate-limit window resets',
                schema: { type: 'integer' as const },
              },
            },
          }
        : {}),
      content: {
        'application/json': {
          example: errorBody(
            example.code,
            example.message,
            'details' in example ? example.details : undefined,
          ),
        },
      },
    };
  }

  if (!operation.tags?.length) {
    const tag = normalizePath(path).split('/')[3] ?? 'api';
    operation.tags = [tag.charAt(0).toUpperCase() + tag.slice(1)];
  }
}

/** Builds the public OpenAPI document from live Nest routes plus the README catalog. */
export function createApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TradeSense AI API')
    .setDescription(
      'Explainable forex intelligence, signals and paper trading. All responses use the README §8.1 envelope.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addApiKey(
      { type: 'apiKey', in: 'cookie', name: String(env.REFRESH_COOKIE_NAME ?? 'refresh_token') },
      'refreshCookie',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, { deepScanRoutes: true });
  for (const [rawPath, pathItem] of Object.entries(document.paths ?? {})) {
    const path = normalizePath(rawPath);
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (operation) enrichOperation(operation, method, path);
    }
  }
  return document;
}
