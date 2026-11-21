import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizePath,
  type HttpMethod,
  type RouteAuth,
} from '../../src/common/openapi/route-catalog';

export interface ContractRoute {
  method: HttpMethod;
  path: string;
  auth: RouteAuth;
}

const METHODS: readonly string[] = ['GET', 'POST', 'PATCH', 'DELETE'];

function normalizeAuth(raw: string): RouteAuth {
  if (raw.startsWith('Public')) return 'Public';
  if (raw.startsWith('Cookie')) return 'Cookie';
  if (raw.includes('ADMIN')) return 'ADMIN';
  if (raw.includes('ANALYST')) return 'ANALYST';
  return 'Bearer';
}

/** Splits a Markdown row on pipes that are outside inline-code spans. */
function markdownCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (const char of line) {
    if (char === '`') inCode = !inCode;
    if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.slice(1, -1);
}

/** Parses README §8.2 directly so the documentation is the contract source. */
export function readReadmeContract(): ContractRoute[] {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
  const section = readme.split('### 8.2 Endpoint catalog')[1]?.split('### 8.3')[0];
  if (!section) throw new Error('README §8.2 is missing');

  const routes: ContractRoute[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = markdownCells(line);
    if (cells.length < 4 || !METHODS.some((method) => cells[0].startsWith(method))) continue;

    const methods = cells[0]
      .split('/')
      .map((method) => method.toLowerCase())
      .filter((method): method is HttpMethod => METHODS.includes(method.toUpperCase()));
    const paths = [...cells[1].matchAll(/`([^`]+)`/g)].map((match) => normalizePath(match[1]));
    const auth = normalizeAuth(cells[3] ?? 'Bearer');
    for (const method of methods) {
      for (const path of paths) routes.push({ method, path, auth });
    }
  }
  return routes;
}

export function contractKey(route: Pick<ContractRoute, 'method' | 'path'>): string {
  return `${route.method.toUpperCase()} ${normalizePath(route.path)}`;
}
