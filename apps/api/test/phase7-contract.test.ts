import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApiDocument } from '../src/common/openapi/openapi';
import {
  ROUTE_CATALOG,
  catalogKey,
  normalizePath,
  type RouteSpec,
} from '../src/common/openapi/route-catalog';
import { contractKey, readReadmeContract, type ContractRoute } from './helpers/readme-contract';
import { liveRoutes } from './helpers/route-metadata';
import { createPhase7TestApp, type Phase7TestApp } from './helpers/test-app';

function defined<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

function equalTo<T>(actual: T, expected: T, label: string): void {
  expect({ label, actual }).toEqual({ label, actual: expected });
}

function exampleOf(value: unknown): unknown {
  return (value as { content?: Record<string, { example?: unknown }> })?.content?.[
    'application/json'
  ]?.example;
}

function schemaOf(value: unknown): unknown {
  return (value as { content?: Record<string, { schema?: unknown }> })?.content?.[
    'application/json'
  ]?.schema;
}

function sortedKeys(routes: readonly ContractRoute[]): string[] {
  return routes.map(contractKey).sort();
}

function withoutRateLimits(document: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(document)) as typeof document;
  const paths = copy['paths'] as Record<string, Record<string, Record<string, unknown>>>;
  for (const pathItem of Object.values(paths)) {
    for (const operation of Object.values(pathItem)) {
      delete operation['x-rate-limit'];
    }
  }
  return copy;
}

describe('P07 README §8.2 contract', () => {
  let harness: Phase7TestApp;

  beforeAll(async () => {
    harness = await createPhase7TestApp();
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  }, 120_000);

  it('registers exactly the README routes with the documented auth level', () => {
    const readme = readReadmeContract();
    const catalog = new Map(
      ROUTE_CATALOG.map((route) => [catalogKey(route.method, route.path), route]),
    );
    const live = new Map(liveRoutes(harness.moduleRef).map((route) => [contractKey(route), route]));
    const expectedKeys = sortedKeys(readme);

    expect(readme).toHaveLength(64);
    expect(ROUTE_CATALOG).toHaveLength(readme.length);
    expect(
      sortedKeys([...catalog.values()].map(({ method, path, auth }) => ({ method, path, auth }))),
    ).toEqual(expectedKeys);
    expect(sortedKeys([...live.values()])).toEqual(expectedKeys);
    expect(expectedKeys).toMatchSnapshot();

    for (const route of readme) {
      const key = contractKey(route);
      equalTo(
        defined(catalog.get(key), `catalog route ${key}`).auth,
        route.auth,
        `catalog auth ${key}`,
      );
      equalTo(defined(live.get(key), `live route ${key}`).auth, route.auth, `live auth ${key}`);
      equalTo(
        defined(catalog.get(key), `catalog route ${key}`).queryParams ?? [],
        route.queryParams ?? [],
        `catalog query params ${key}`,
      );
    }
  });

  it('publishes honest request, success, error, parameter and schema examples', () => {
    const document = createApiDocument(harness.app);
    const readme = readReadmeContract();
    const catalog = new Map(
      ROUTE_CATALOG.map((route) => [catalogKey(route.method, route.path), route]),
    );

    for (const route of readme) {
      const key = catalogKey(route.method, route.path);
      const spec: RouteSpec = defined(catalog.get(key), `catalog route ${key}`);
      const operation = defined(
        document.paths?.[normalizePath(route.path)]?.[route.method],
        `OpenAPI route ${key}`,
      );
      const record = operation as unknown as Record<string, unknown>;

      equalTo(record['x-auth'], route.auth, `OpenAPI auth ${key}`);
      expect(record['x-rate-limit']).toBeDefined();
      expect(operation.summary).toBeTruthy();
      expect(exampleOf(operation.responses?.[spec.errorExample?.status ?? 501])).toBeDefined();

      if (spec.dataExample !== undefined) {
        const successStatus = String(spec.status ?? (route.method === 'post' ? 201 : 200));
        expect(exampleOf(operation.responses?.[successStatus])).toMatchObject({
          success: true,
          data: spec.dataExample,
        });
      }

      if (
        spec.requestExample !== undefined &&
        route.method !== 'get' &&
        route.method !== 'delete'
      ) {
        expect(exampleOf(operation.requestBody)).toBeDefined();
        expect(schemaOf(operation.requestBody)).toMatchObject({ type: 'object' });
      }

      const parameterNames = new Set(
        ((operation.parameters ?? []) as Array<{ name: string }>).map(
          (parameter) => parameter.name,
        ),
      );
      for (const name of [...(route.queryParams ?? []), ...(spec.queryParams ?? [])]) {
        expect(parameterNames.has(name)).toBe(true);
      }
      for (const match of normalizePath(route.path).matchAll(/\{([^}]+)\}/g)) {
        expect(parameterNames.has(match[1])).toBe(true);
      }

      for (const status of ['401', '403', '422', '429', '500', '501', '503']) {
        expect(exampleOf(operation.responses?.[status])).toBeDefined();
      }
    }

    expect(document.components?.schemas?.['ApiSuccess']).toBeDefined();
    expect(document.components?.schemas?.['ApiError']).toBeDefined();

    for (const internal of ['/api/v1/indicators', '/api/v1/features', '/api/v1/predict']) {
      expect(document.paths?.[internal]).toBeUndefined();
    }
    for (const field of ['passwordHash', 'refreshTokenHash', 'tokenHash', 'jti']) {
      expect(JSON.stringify(document)).not.toContain(field);
    }
  });

  it('keeps the exported OpenAPI artifact in sync with the live contract', () => {
    const path = resolve(process.cwd(), 'docs/openapi.json');
    expect(existsSync(path)).toBe(true);
    const exported = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const generated = JSON.parse(JSON.stringify(createApiDocument(harness.app))) as Record<
      string,
      unknown
    >;

    expect(withoutRateLimits(exported)).toEqual(withoutRateLimits(generated));
  });
});
