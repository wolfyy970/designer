/** Normalize an unknown caught value to a string message. */
export function normalizeError(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}

/** Parse API error response body: prefers JSON `{ error }`, else returns raw text. */
export function parseApiErrorBody(text: string): string {
  try {
    const json = JSON.parse(text) as { error?: unknown };
    if (json.error !== undefined && json.error !== null) {
      return typeof json.error === 'string' ? json.error : String(json.error);
    }
    return text;
  } catch {
    return text;
  }
}
