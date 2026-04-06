/**
 * Shared regex-style HTML helpers for VM-only browser QA (no DOM).
 * Playwright metrics use real rendering; these stay structural/regex-based.
 */

export function hasTag(html: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s>]`, 'i').test(html);
}

export function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

export function extractScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].trim()) bodies.push(m[1]);
  }
  return bodies;
}

/** External script `src` and stylesheet `href` references (relative or absolute paths). */
export function extractExternalRefs(html: string): { src: string }[] {
  const refs: { src: string }[] = [];
  const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    if (m[1]) refs.push({ src: m[1] });
  }
  const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    if (m[1]) refs.push({ src: m[1] });
  }
  return refs;
}
