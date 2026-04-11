/** Shared fetch helpers for API modules (not a public surface — use `client.ts` re-exports). */
import type { ZodType } from 'zod';
import { parseApiErrorBody } from '../lib/error-utils';

export const API_BASE = '/api';

export const INVALID_SERVER_RESPONSE = 'Invalid server response';

export async function postParsed<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorBody(text));
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.warn(`[api] POST ${path} response shape unexpected`, r.error.flatten());
    }
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  return r.data;
}

/** GET helper: on !ok returns `empty`; on invalid JSON or schema mismatch returns `empty` (matches prior loose `json()` usage). */
export async function getParsedList<T>(path: string, schema: ZodType<T>, empty: T): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) return empty;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return empty;
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.warn(`[api] GET ${path} response shape unexpected`, r.error.flatten());
    }
    return empty;
  }
  return r.data;
}
