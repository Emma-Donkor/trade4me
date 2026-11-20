const REDACTED = '[REDACTED]';

const SENSITIVE_EXACT = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'database_url',
  'jwt_secret',
  'jwt_refresh_secret',
]);

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return (
    SENSITIVE_EXACT.has(normalized) ||
    normalized.includes('api_key') ||
    normalized.includes('secret') ||
    normalized.endsWith('_token')
  );
}

/**
 * Recursively removes credentials from anything written to logs or audit rows.
 * Matches `authorization`, `cookie`, `DATABASE_URL` and `*API_KEY*`.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (depth > 8) return REDACTED;
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth + 1);
    }
    return result;
  }
  return REDACTED;
}
