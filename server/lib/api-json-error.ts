import type { Context } from 'hono';

/** HTTP statuses used by `/api/*` JSON errors (matches Hono `ContentfulStatusCode` subset). */
type ApiJsonErrorStatus = 400 | 404 | 413 | 422 | 500 | 503;

/** Standard JSON error body for `/api/*` routes (non-raw responses). */
export type ApiJsonErrorBody = { error: string; details?: unknown };

/**
 * Returns JSON `{ error: string, details?: unknown }` so clients can rely on a single failure contract.
 * Prefer this over ad-hoc `c.json({ error: ... })` for consistency with `parseApiErrorBody` on the client.
 */
export function apiJsonError(
  c: Context,
  status: ApiJsonErrorStatus,
  message: string,
  details?: unknown,
) {
  const body: ApiJsonErrorBody = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  return c.json(body, status);
}
