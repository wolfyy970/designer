/** Stable random id for client-side entities (matches server `crypto.randomUUID()` usage). */
export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/**
 * Interpolate `{{KEY}}` placeholders in a template string.
 * Any `{{KEY}}` not found in `vars` is left as-is.
 */
export function interpolate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );
}
