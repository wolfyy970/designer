/** Normalize an unknown caught value to a string message. */
export function normalizeError(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}

/** Human-readable lines from Zod's `flatten()` (or similar `{ formErrors, fieldErrors }`). */
export function formatZodFlattenDetails(details: unknown): string {
  if (details == null || typeof details !== 'object') return '';
  const d = details as { formErrors?: unknown; fieldErrors?: unknown };
  const lines: string[] = [];
  if (Array.isArray(d.formErrors)) {
    for (const e of d.formErrors) {
      if (typeof e === 'string' && e) lines.push(e);
    }
  }
  const fe = d.fieldErrors;
  if (fe && typeof fe === 'object' && !Array.isArray(fe)) {
    for (const [key, val] of Object.entries(fe)) {
      if (Array.isArray(val) && val.some((x) => typeof x === 'string' && x)) {
        lines.push(`${key}: ${val.filter((x) => typeof x === 'string').join('; ')}`);
      } else if (val != null && typeof val === 'object') {
        lines.push(`${key}: ${JSON.stringify(val)}`);
      }
    }
  }
  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
}

/** Parse API error response body: prefers JSON `{ error }`, optional `{ details }` (e.g. Zod flatten), else raw text. */
export function parseApiErrorBody(text: string): string {
  try {
    const json = JSON.parse(text) as { error?: unknown; details?: unknown };
    if (json.error !== undefined && json.error !== null) {
      const base = typeof json.error === 'string' ? json.error : String(json.error);
      return base + formatZodFlattenDetails(json.details);
    }
    return text;
  } catch {
    return text;
  }
}
