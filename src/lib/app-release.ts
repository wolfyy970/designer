/**
 * Release metadata from Vite `define` (`vite.config.ts`): `package.json` semver + commit time of `HEAD`
 * (`git log -1 --format=%cI`), or optional `package.json` `releasedAt` if git is unavailable.
 * Eastern (US) formatting is for display only.
 */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;
export const RELEASED_AT_ISO = import.meta.env.VITE_APP_RELEASED_AT;

/** `version` with a leading `v` when non-empty */
export function versionLabel(): string {
  return APP_VERSION ? `v${APP_VERSION}` : '';
}

/**
 * User-facing date/time in Eastern (US) for a release timestamp.
 * Accepts any `Date`-parseable string (include offset or `Z` so local machine TZ doesn’t shift it).
 */
export function formatReleasedAtEastern(iso: string): string {
  const s = iso.trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

/** e.g. `v0.3.1 · Apr 4, 2026, 12:00 PM EDT` */
export function appReleaseLabel(): string {
  const v = versionLabel();
  const t = formatReleasedAtEastern(RELEASED_AT_ISO);
  if (v && t) return `${v} · ${t}`;
  if (v) return v;
  return t;
}
