/**
 * Google Fonts allowlist — the rules deciding which external URLs generated
 * artifacts may reference.
 *
 * Retargeted: this used to import `src/lib/google-fonts-allowlist.ts`, which had
 * **no production importer at all** — `validate_html` and `validate_artifact` in
 * the Pi package use the package's own copy. So the suite exercised a dead module
 * while the live allowlist went untested, and `ARCHITECTURE.md` described the
 * dead copy as the runtime one.
 *
 * The dead copy is deleted; these assertions now hit the copy that actually runs.
 * The two were behaviourally identical at the time of the change, so the original
 * expectations are unchanged — only the import moved.
 *
 * This is a security boundary: it decides whether generated output may pull
 * third-party CSS. `fonts.googleapis.com` serves stylesheets and
 * `fonts.gstatic.com` serves font files; the two are deliberately not
 * interchangeable.
 */
import { describe, expect, it } from 'vitest';

import {
  isAllowedGoogleFontAssetHost,
  isAllowedGoogleFontStylesheetUrl,
  isAllowedGoogleFontsExternalRef,
} from '../../../packages/auto-designer-pi/src/internal/google-fonts-allowlist';

describe('google-fonts-allowlist (the copy validate_html actually uses)', () => {
  it('allows fonts.googleapis.com stylesheet URLs', () => {
    expect(
      isAllowedGoogleFontStylesheetUrl(
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap',
      ),
    ).toBe(true);
    expect(isAllowedGoogleFontStylesheetUrl('//fonts.googleapis.com/css2?family=Roboto')).toBe(true);
    expect(
      isAllowedGoogleFontsExternalRef('https://fonts.googleapis.com/css?family=Old+Standard+TT'),
    ).toBe(true);
  });

  it('allows fonts.gstatic.com asset hosts', () => {
    expect(
      isAllowedGoogleFontAssetHost(
        'https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZOIHQ.woff2',
      ),
    ).toBe(true);
    expect(isAllowedGoogleFontsExternalRef('https://fonts.gstatic.com/s/roboto/v47/foo.woff2')).toBe(
      true,
    );
  });

  it('rejects other hosts', () => {
    expect(isAllowedGoogleFontStylesheetUrl('https://evil.com/font.css')).toBe(false);
    expect(isAllowedGoogleFontStylesheetUrl('https://fonts.gstatic.com/x.css')).toBe(false);
    expect(isAllowedGoogleFontAssetHost('https://fonts.googleapis.com/css2?family=x')).toBe(false);
    expect(isAllowedGoogleFontsExternalRef('https://unpkg.com/foo.css')).toBe(false);
  });

  it('rejects lookalike hosts that merely contain the allowed name', () => {
    // A suffix/prefix match rather than a host comparison would let an
    // attacker-registered domain through.
    expect(isAllowedGoogleFontStylesheetUrl('https://fonts.googleapis.com.evil.com/css')).toBe(
      false,
    );
    expect(isAllowedGoogleFontStylesheetUrl('https://evilfonts.googleapis.com/css')).toBe(false);
    expect(isAllowedGoogleFontAssetHost('https://notfonts.gstatic.com/x.woff2')).toBe(false);
    expect(isAllowedGoogleFontsExternalRef('https://evil.com/?u=fonts.googleapis.com')).toBe(false);
  });

  it('rejects a bare origin or empty ref', () => {
    expect(isAllowedGoogleFontsExternalRef('')).toBe(false);
    expect(isAllowedGoogleFontsExternalRef('https://')).toBe(false);
  });
});
