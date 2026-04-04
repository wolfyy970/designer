import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
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
