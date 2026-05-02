/**
 * Allowlisted hosts for Google Fonts in agent HTML/CSS (validate_html, prompts).
 * Other external CDNs remain disallowed.
 */
const GOOGLE_FONTS_CSS_HOSTS = ['fonts.googleapis.com'] as const;
const GOOGLE_FONTS_ASSET_HOSTS = ['fonts.gstatic.com'] as const;

function parseUrlHost(ref: string): string | null {
  const raw = ref.trim();
  if (!raw || raw.startsWith('data:')) return null;
  try {
    if (raw.startsWith('//')) return new URL(`https:${raw}`).hostname.toLowerCase();
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/** `<link rel="stylesheet">` href: Google Fonts CSS API only (`fonts.googleapis.com`). */
export function isAllowedGoogleFontStylesheetUrl(ref: string): boolean {
  const host = parseUrlHost(ref);
  if (!host) return false;
  return GOOGLE_FONTS_CSS_HOSTS.some((h) => host === h);
}

/** `fonts.gstatic.com` font file URLs (e.g. rare direct @import); primary path is CSS → gstatic. */
export function isAllowedGoogleFontAssetHost(ref: string): boolean {
  const host = parseUrlHost(ref);
  if (!host) return false;
  return GOOGLE_FONTS_ASSET_HOSTS.some((h) => host === h);
}

/** True if external ref is any allowlisted Google Fonts URL (CSS or gstatic asset). */
export function isAllowedGoogleFontsExternalRef(ref: string): boolean {
  return isAllowedGoogleFontStylesheetUrl(ref) || isAllowedGoogleFontAssetHost(ref);
}
