/**
 * Pre-commit: increment only the patch segment of package.json "version".
 * @see src/lib/semver-bump-patch.ts (tested); guards match bump-patch-version docs in CLAUDE.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpSemverPatch } from '../src/lib/semver-bump-patch.ts';

if (process.env.CI === 'true') process.exit(0);
const skipBump = String(process.env.SKIP_PATCH_BUMP ?? '')
  .trim()
  .toLowerCase();
if (['1', 'true', 'yes'].includes(skipBump)) process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const raw = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw) as { version?: string };

const v = pkg.version;
if (typeof v !== 'string') {
  console.error('bump-patch-version: package.json missing string "version"');
  process.exit(1);
}

try {
  pkg.version = bumpSemverPatch(v);
} catch (e) {
  console.error('bump-patch-version:', e instanceof Error ? e.message : e);
  process.exit(1);
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
