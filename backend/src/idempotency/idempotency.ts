import { createHash } from 'node:crypto';

/** Client-generated key: UUID or similar, 16 to 128 safe characters. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
export const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);
/** Stored results are kept long enough for a device to come back online. */
export const IDEMPOTENCY_RETENTION_DAYS = 7;

/** Canonical JSON (sorted keys) so the same body always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export function requestFingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256').update(`${method.toUpperCase()} ${path}\n${canonicalJson(body)}`).digest('hex');
}

export type StoredOutcome =
  | { kind: 'execute' }
  | { kind: 'replay'; statusCode: number; response: unknown }
  | { kind: 'in-progress' }
  | { kind: 'mismatch' };

/** What to do with a request whose key was already seen. */
export function outcomeFor(existing: { requestHash: string; statusCode: number; response: unknown } | null, fingerprint: string): StoredOutcome {
  if (!existing) return { kind: 'execute' };
  if (existing.requestHash !== fingerprint) return { kind: 'mismatch' };
  if (existing.statusCode === 0) return { kind: 'in-progress' };
  return { kind: 'replay', statusCode: existing.statusCode, response: existing.response };
}
