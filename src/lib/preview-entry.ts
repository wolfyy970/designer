/**
 * Canonical HTML entry for a static virtual file tree — used by preview URLs,
 * bundling fallbacks, and evaluator alignment.
 */
export function resolvePreviewEntryPath(files: Record<string, string>): string {
  if (files['index.html']) return 'index.html';
  const htmlKeys = Object.keys(files).filter((p) => p.endsWith('.html'));
  if (htmlKeys.length === 0) return 'index.html';
  htmlKeys.sort((a, b) => a.localeCompare(b));
  return htmlKeys[0];
}

/** Encode each path segment for use in a URL path under `/sessions/:id/...`. */
export function encodeVirtualPathForUrl(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized
    .split('/')
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join('/');
}

/** Stable file ordering for code tabs (no fixed trio assumption). */
export function preferredArtifactFileOrder(files: Record<string, string>): string[] {
  const keys = Object.keys(files);
  const rest = keys.filter((k) => k !== 'index.html').sort((a, b) => a.localeCompare(b));
  if (keys.includes('index.html')) return ['index.html', ...rest];
  return rest;
}
