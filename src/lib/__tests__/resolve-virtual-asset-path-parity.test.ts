/**
 * Parity guard for a deliberately mirrored module.
 *
 * `resolveVirtualAssetPath` / `classifyAssetRef` exist twice:
 *
 *   - `src/lib/resolve-virtual-asset-path.ts`                 (app: bundling, preview, integrity)
 *   - `packages/auto-designer-pi/src/internal/…`              (sandbox: validate_html, validate_artifact)
 *
 * The Pi package cannot import from `src/` (it is the SDK boundary and ships
 * standalone), so the duplication is structural, not accidental — the same
 * arrangement the docs already describe for `google-fonts-allowlist.ts`.
 *
 * What was missing is a guard. These two copies are what decide whether a
 * generated artifact's asset reference is a valid local file, an external URL,
 * or a traversal attempt. If they ever disagree, the app and the agent's own
 * `validate_html` / `validate_artifact` self-check would silently disagree about
 * what is valid — the worst kind of drift, because both sides keep working and
 * only the *verdicts* diverge.
 *
 * I diffed them by hand before writing this: behaviour is currently identical,
 * comments differ. A hand diff is not a guard. This is.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyAssetRef as appClassify,
  resolveVirtualAssetPath as appResolve,
} from '../resolve-virtual-asset-path';

import {
  classifyAssetRef as pkgClassify,
  resolveVirtualAssetPath as pkgResolve,
} from '../../../packages/auto-designer-pi/src/internal/resolve-virtual-asset-path';

/** Entry documents the resolution is relative to. */
const ENTRIES = [
  'index.html',
  'pages/about.html',
  'a/b/c/deep.html',
  'index.htm',
  'no-extension',
];

/** Refs covering every branch either implementation has. */
const REFS = [
  // plain relative
  'styles.css',
  './styles.css',
  'js/app.js',
  'assets/logo.svg',
  // traversal (security-relevant: must not escape the virtual root)
  '../styles.css',
  '../../secrets.env',
  '../../../etc/passwd',
  'a/../../b.css',
  './../x.css',
  // absolute and root-ish
  '/styles.css',
  '/',
  '/nested/app.js',
  // fragments and queries (stripped before resolution)
  'styles.css#main',
  'styles.css?v=2',
  'styles.css?v=2#main',
  '#section',
  '?query',
  '#',
  '?',
  // external / non-path schemes (must resolve to undefined / 'external')
  'https://cdn.example.com/a.css',
  'http://cdn.example.com/a.css',
  '//cdn.example.com/a.css',
  'data:text/css,body{}',
  'mailto:hi@example.com',
  'javascript:void(0)',
  'tel:+15551234',
  'HTTP://UPPER.EXAMPLE.COM/a.css',
  'Data:text/css,body{}',
  // whitespace and empties
  '',
  '   ',
  '  styles.css  ',
  '\t/nested/app.js\n',
  // odd but legal filenames
  'my file.css',
  'my%20file.css',
  'a.b.c.css',
  'UPPER.CSS',
];

describe('resolve-virtual-asset-path mirror parity', () => {
  it('agrees on classifyAssetRef for every ref', () => {
    const divergences: string[] = [];
    for (const ref of REFS) {
      const app = appClassify(ref);
      const pkg = pkgClassify(ref);
      if (app !== pkg) divergences.push(`classify(${JSON.stringify(ref)}): app=${app} pkg=${pkg}`);
    }
    expect(divergences, divergences.join('\n')).toEqual([]);
  });

  it('agrees on resolveVirtualAssetPath for every ref × entry pair', () => {
    const divergences: string[] = [];
    for (const entry of ENTRIES) {
      for (const ref of REFS) {
        const app = appResolve(ref, entry);
        const pkg = pkgResolve(ref, entry);
        if (app !== pkg) {
          divergences.push(
            `resolve(${JSON.stringify(ref)}, ${JSON.stringify(entry)}): app=${String(app)} pkg=${String(pkg)}`,
          );
        }
      }
    }
    expect(divergences, divergences.join('\n')).toEqual([]);
  });

  it('does not let a ref escape the virtual root', () => {
    // Behavioural assertion on BOTH copies: traversal is clamped, never returns
    // a path that climbs above the root. Pinned here because it is the
    // security-relevant property of this module.
    for (const resolve of [appResolve, pkgResolve]) {
      for (const ref of ['../secrets.env', '../../etc/passwd', 'a/../../b.css']) {
        const out = resolve(ref, 'index.html');
        expect(out, `${ref} -> ${String(out)}`).toBeDefined();
        expect(out?.startsWith('..'), `${ref} -> ${String(out)}`).toBe(false);
      }
    }
  });

  it('treats external refs as unresolvable in both copies', () => {
    const external = [
      'https://cdn.example.com/a.css',
      '//cdn.example.com/a.css',
      'data:text/css,body{}',
    ];
    for (const ref of external) {
      expect(appResolve(ref, 'index.html'), `app ${ref}`).toBeUndefined();
      expect(pkgResolve(ref, 'index.html'), `pkg ${ref}`).toBeUndefined();
      expect(appClassify(ref), `app classify ${ref}`).toBe('external');
      expect(pkgClassify(ref), `pkg classify ${ref}`).toBe('external');
    }
  });

  it('classifies non-path schemes as external only in the RESOLVER, not the classifier', () => {
    /**
     * Documented quirk, pinned so neither copy drifts and so nobody "fixes" one
     * side by accident.
     *
     * `resolveVirtualAssetPath` has an explicit guard for `mailto:` /
     * `javascript:` / `tel:` and returns `undefined` for them.
     * `classifyAssetRef` has no such guard, so it reports the same ref as
     * `'relative'`.
     *
     * Consequence at a real call site (html-validation.ts:65-81): a
     * `mailto:` in a `<link href>` takes the `'relative'` path, the resolver
     * then returns `undefined`, and validation `continue`s — i.e. the ref is
     * silently ignored rather than reported as an external asset. That is the
     * current behaviour and it is not obviously wrong, but it is a real
     * asymmetry between two functions that look interchangeable.
     *
     * Changing either side would change what `validate_html` reports to the
     * agent, so this is pinned rather than altered. If it should change, change
     * both copies and this test together.
     */
    for (const ref of ['mailto:hi@example.com', 'javascript:void(0)', 'tel:+15551234']) {
      expect(appResolve(ref, 'index.html'), `app resolve ${ref}`).toBeUndefined();
      expect(pkgResolve(ref, 'index.html'), `pkg resolve ${ref}`).toBeUndefined();
      // both copies agree with each other, which is what parity requires
      expect(appClassify(ref), `app classify ${ref}`).toBe(pkgClassify(ref));
      expect(appClassify(ref), `app classify ${ref}`).toBe('relative');
    }
  });
});
