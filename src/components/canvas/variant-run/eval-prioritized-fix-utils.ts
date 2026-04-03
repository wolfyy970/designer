/** Filter ultra-noisy hard-fail strings from inline variant cards (same rules as before). */
export function filterNoisePrioritizedFixes(fixes: string[]): string[] {
  return fixes.filter(
    (f) =>
      !f.startsWith('[hard_fail:missing_assets') &&
      !f.startsWith('[hard_fail:js_') &&
      !f.startsWith('[hard_fail:empty_'),
  );
}

/**
 * If `text` contains JSON (whole string or tail after prose), return pretty-printed body.
 */
export function tryPrettyJson(text: string): { label?: string; json: string } | null {
  const raw = text.trim();
  if (!raw) return null;

  const parse = (s: string): string | null => {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return null;
    }
  };

  const whole = parse(raw);
  if (whole) return { json: whole };

  const brace = raw.indexOf('{');
  const bracket = raw.indexOf('[');
  const start =
    brace === -1 ? bracket : bracket === -1 ? brace : Math.min(brace, bracket);
  if (start > 0) {
    const tail = raw.slice(start);
    const pretty = parse(tail);
    if (pretty) {
      const label = raw
        .slice(0, start)
        .trim()
        .replace(/:\s*$/, '')
        .trim();
      return label ? { label, json: pretty } : { json: pretty };
    }
  }
  return null;
}
