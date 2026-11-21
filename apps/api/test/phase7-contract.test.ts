import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApiDocument } from '../src/common/openapi/openapi';
import { ROUTE_CATALOG, catalogKey, normalizePath } from '../src/common/openapi/route-catalog';
import { contractKey, readReadmeContract } from './helpers/readme-contract';
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

describe('P07 README §8.2 contract', () => {
  let harness: Phase7TestApp;

  beforeAll(async () => {
    harness = await createPhase7TestApp();
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  }, 120_000);

  it('registers every README route with the documented auth level', () => {
    const readme = readReadmeContract();
    const catalog = new Map(
      ROUTE_CATALOG.map((route) => [catalogKey(route.method, route.path), route]),
    );
    const live = new Map(liveRoutes(harness.moduleRef).map((route) => [contractKey(route), route]));

    expect(readme).toHaveLength(60);
    expect(ROUTE_CATALOG).toHaveLength(readme.length);
    expect(readme.map(contractKey).sort()).toMatchSnapshot();

    for (const route of readme) {
      const key = contractKey(route);
      equalTo(
        defined(catalog.get(key), `catalog route ${key}`).auth,
        route.auth,
        `catalog auth ${key}`,
      );
      equalTo(defined(live.get(key), `live route ${key}`).auth, route.auth, `live auth ${key}`);
    }
  });

  it('publishes request, success and error examples for every catalog route', () => {
    const document = createApiDocument(harness.app);
    const readme = readReadmeContract();
    const catalog = new Map(
      ROUTE_CATALOG.map((route) => [catalogKey(route.method, route.path), route]),
    );

    for (const route of readme) {
      const key = catalogKey(route.method, route.path);
      const spec = defined(catalog.get(key), `catalog route ${key}`);
      const operation = defined(
        document.paths?.[normalizePath(route.path)]?.[route.method],
        `OpenAPI route ${key}`,
      );

      equalTo(
        (operation as unknown as Record<string, unknown>)['x-auth'],
        route.auth,
        `OpenAPI auth ${key}`,
      );
      expect(operation.summary).toBeTruthy();

      const successStatus = String(spec.status ?? (route.method === 'post' ? 201 : 200));
      expect(exampleOf(operation.responses?.[successStatus])).toBeDefined();

      if (
        spec.requestExample !== undefined &&
        route.method !== 'get' &&
        route.method !== 'delete'
      ) {
        expect(exampleOf(operation.requestBody)).toBeDefined();
      }

      for (const status of ['401', '403', '422', '429', '500', '501', '503']) {
        expect(exampleOf(operation.responses?.[status])).toBeDefined();
      }
    }

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
    const document = JSON.parse(readFileSync(path, 'utf8')) as {
      paths?: Record<string, Record<string, unknown>>;
    };
    for (const route of readReadmeContract()) {
      expect(document.paths?.[normalizePath(route.path)]?.[route.method]).toBeDefined();
    }
  });
});
