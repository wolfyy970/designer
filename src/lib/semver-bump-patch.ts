/** Strict numeric semver x.y.z; only the patch segment may change here. */
const NUMERIC_SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Returns `version` with patch segment incremented by 1.
 * @throws if `version` is not `d+.d+.d+` or patch is not finite
 */
export function bumpSemverPatch(version: string): string {
  if (typeof version !== 'string' || !NUMERIC_SEMVER.test(version)) {
    throw new Error(`bumpSemverPatch: expected numeric semver x.y.z, got ${JSON.stringify(version)}`);
  }
  const parts = version.split('.');
  const patch = parseInt(parts[2]!, 10);
  if (!Number.isFinite(patch)) {
    throw new Error('bumpSemverPatch: invalid patch segment');
  }
  parts[2] = String(patch + 1);
  return parts.join('.');
}
