import type { Context } from 'hono';
import type { z, ZodType } from 'zod';
import { apiJsonError } from './api-json-error.ts';

type ParseJsonOptions = {
  /** Dev-only: logs flatten() details when validation fails */
  devWarnLabel?: string;
};

/**
 * `await c.req.json()` + Zod `safeParse`.
 * - Malformed JSON → 400 `{ error: 'Invalid JSON body' }`.
 * - Schema failure → 400 `{ error: 'Invalid request', details: flatten() }`.
 */
export async function parseRequestJson<T extends ZodType>(
  c: Context,
  schema: T,
  options?: ParseJsonOptions,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: apiJsonError(c, 400, 'Invalid JSON body') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    if (process.env.NODE_ENV !== 'production' && options?.devWarnLabel) {
      console.warn(options.devWarnLabel, 'validation failed', details);
    }
    return { ok: false, response: apiJsonError(c, 400, 'Invalid request', details) };
  }
  return { ok: true, data: parsed.data };
}
