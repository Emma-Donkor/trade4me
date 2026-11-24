import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { env } from '@ts/config';
import {
  ROUTE_CATALOG,
  catalogKey,
  normalizePath,
  type HttpMethod,
  type RouteSpec,
} from './route-catalog';

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

const QUERY_SCHEMAS: Record<string, Record<string, unknown>> = {
  symbols: {
    type: 'string',
    description: 'One symbol or a comma-separated symbol list',
    example: 'EUR/USD',
  },
  symbol: { type: 'string', example: 'EUR/USD' },
  timeframe: { type: 'string', example: 'H1' },
  indicators: {
    type: 'array',
    items: { type: 'string', example: 'RSI14' },
    style: 'form',
    explode: true,
  },
  start: { type: 'string', format: 'date-time' },
  end: { type: 'string', format: 'date-time' },
  limit: { type: 'integer', minimum: 1, maximum: 500 },
  page: { type: 'integer', minimum: 1, maximum: 100000 },
  pageSize: { type: 'integer', minimum: 1, maximum: 500 },
  cursor: { type: 'string', minLength: 1 },
  sortBy: { type: 'string', enum: ['score', 'probability', 'risk', 'volatility'] },
  order: { type: 'string', enum: ['asc', 'desc'] },
};

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

function schemaFromExample(example: unknown): Record<string, unknown> {
  if (example === null) return {};
  if (Array.isArray(example)) {
    return { type: 'array', items: example.length > 0 ? schemaFromExample(example[0]) : {} };
  }
  if (typeof example === 'object') {
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(example as Record<string, unknown>).map(([key, value]) => [
          key,
          schemaFromExample(value),
        ]),
      ),
    };
  }
  if (typeof example === 'number') return { type: 'number' };
  if (typeof example === 'boolean') return { type: 'boolean' };
  if (typeof example === 'string') return { type: 'string' };
  return {};
}

function addParameters(
  operation: OperationObject,
  spec: RouteSpec | undefined,
  path: string,
): void {
  const parameters = (operation.parameters ?? []) as unknown as Array<Record<string, unknown>>;
  const seen = new Set(
    parameters.map((parameter) => `${String(parameter['in'])}:${String(parameter['name'])}`),
  );

  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    const key = `path:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parameters.push({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string', minLength: 1 },
    });
  }

  for (const name of spec?.queryParams ?? []) {
    const key = `query:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parameters.push({
      name,
      in: 'query',
      required: false,
      schema: QUERY_SCHEMAS[name] ?? { type: 'string' },
    });
  }

  if (parameters.length > 0) {
    operation.parameters = parameters as unknown as OperationObject['parameters'];
  }
}

function rateLimitFor(method: HttpMethod, path: string, spec: RouteSpec | undefined) {
  if (/^\/api\/v1\/ai\/(assistant|explain)$/.test(path)) {
    return { scope: 'user', limit: 20, windowSeconds: 60 };
  }
  if (
    spec?.auth === 'Cookie' ||
    (method === 'post' && /\/auth\/(login|forgot-password)$/.test(path))
  ) {
    return { scope: 'ip', limit: Number(env.RATE_LIMIT_AUTH_MAX), windowSeconds: 60 };
  }
  return { scope: 'ip', limit: Number(env.RATE_LIMIT_MAX), windowSeconds: 60 };
}

function enrichOperation(operation: OperationObject, method: HttpMethod, path: string): void {
  const key = catalogKey(method, path);
  const spec = ROUTE_CATALOG.find((route) => catalogKey(route.method, route.path) === key);
  const record = operationRecord(operation);

  if (spec) {
    operation.summary = spec.summary;
    record['x-auth'] = spec.auth;
    record['x-roles'] =
      spec.auth === 'ADMIN' ? ['ADMIN'] : spec.auth === 'ANALYST' ? ['ANALYST'] : undefined;
    if (record['x-roles'] === undefined) delete record['x-roles'];
    record['x-rate-limit'] = rateLimitFor(method, path, spec);
    operation.security =
      spec.auth === 'Public'
        ? []
        : spec.auth === 'Cookie'
          ? [{ refreshCookie: [] }]
          : [{ bearer: [] }];

    if (spec.dataExample === undefined) {
      for (const status of Object.keys(operation.responses)) {
        if (/^2\d\d$/.test(status)) delete operation.responses[status];
      }
    } else {
      const successStatus = String(spec.status ?? (method === 'post' ? 201 : 200));
      operation.responses[successStatus] = {
        description: spec.summary,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiSuccess' },
            example: {
              success: true,
              data: spec.dataExample,
              requestId: 'req_01Jexample',
            },
          },
        },
      };
    }

    if (spec.requestExample !== undefined && method !== 'get' && method !== 'delete') {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: schemaFromExample(spec.requestExample),
            example: spec.requestExample,
          },
        },
      };
    }
  }

  for (const example of ERROR_EXAMPLES) {
    if (spec?.errorExample?.status === example.status) continue;
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
          schema: { $ref: '#/components/schemas/ApiError' },
          example: errorBody(
            example.code,
            example.message,
            'details' in example ? example.details : undefined,
          ),
        },
      },
    };
  }

  if (spec?.errorExample) {
    const status = String(spec.errorExample.status);
    operation.responses[status] = {
      description: spec.errorExample.code,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
          example: errorBody(spec.errorExample.code, spec.errorExample.message),
        },
      },
    };
  }

  addParameters(operation, spec, path);

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
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ApiSuccess: {
        type: 'object',
        required: ['success', 'data', 'requestId'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: { description: 'Route-specific payload; see the operation example.' },
          requestId: { type: 'string' },
        },
      },
      ApiError: {
        type: 'object',
        required: ['success', 'error', 'requestId'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            required: ['code', 'message', 'requestId'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
              requestId: { type: 'string' },
            },
          },
          requestId: { type: 'string' },
        },
      },
    },
  };

  for (const [rawPath, pathItem] of Object.entries(document.paths ?? {})) {
    const path = normalizePath(rawPath);
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (operation) enrichOperation(operation, method, path);
    }
  }
  return document;
}
