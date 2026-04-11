/**
 * Resolve a relative asset ref (href / src) against the directory of the
 * HTML file that contains it, returning a normalized key for lookup in
 * a flat virtual-file map (keys like "css/style.css", "pages/about.html").
 *
 * Returns `undefined` for external URLs, data URIs, and protocol-relative
 * refs — callers handle those separately (e.g. Google Fonts allowlist).
 *
 * Pure function — no Node / browser dependencies.
 */
export function resolveVirtualAssetPath(
  ref: string,
  htmlFilePath: string,
): string | undefined {
  const clean = ref.split('#')[0]!.split('?')[0]!.trim();
  if (!clean) return undefined;

  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith('data:')) return undefined;
  /** Non-path link targets (occasionally appear on `<link href>`); not virtual files. */
  if (/^(mailto|javascript|tel):/i.test(clean)) return undefined;

  let joined: string;
  if (clean.startsWith('/')) {
    joined = clean.slice(1);
  } else {
    const lastSlash = htmlFilePath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? htmlFilePath.slice(0, lastSlash) : '';
    joined = dir ? `${dir}/${clean}` : clean;
  }

  const segments = joined.split('/').filter((s) => s.length > 0 && s !== '.');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '..') {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

/**
 * Classify a raw ref as external, absolute, or relative.
 * Useful when callers need to distinguish before resolving.
 */
export function classifyAssetRef(
  ref: string,
): 'external' | 'absolute' | 'relative' {
  const clean = ref.split('#')[0]!.split('?')[0]!.trim();
  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith('data:')) return 'external';
  if (clean.startsWith('/')) return 'absolute';
  return 'relative';
}
