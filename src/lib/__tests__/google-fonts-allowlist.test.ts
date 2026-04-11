import { describe, expect, it } from 'vitest';
import {
  isAllowedGoogleFontAssetHost,
  isAllowedGoogleFontStylesheetUrl,
  isAllowedGoogleFontsExternalRef,
} from '../google-fonts-allowlist';

describe('google-fonts-allowlist', () => {
  it('allows fonts.googleapis.com stylesheet URLs', () => {
    expect(
      isAllowedGoogleFontStylesheetUrl(
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap',
      ),
    ).toBe(true);
    expect(isAllowedGoogleFontStylesheetUrl('//fonts.googleapis.com/css2?family=Roboto')).toBe(true);
    expect(isAllowedGoogleFontsExternalRef('https://fonts.googleapis.com/css?family=Old+Standard+TT')).toBe(true);
  });

  it('allows fonts.gstatic.com asset hosts', () => {
    expect(
      isAllowedGoogleFontAssetHost('https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZOIHQ.woff2'),
    ).toBe(true);
    expect(isAllowedGoogleFontsExternalRef('https://fonts.gstatic.com/s/roboto/v47/foo.woff2')).toBe(true);
  });

  it('rejects other hosts', () => {
    expect(isAllowedGoogleFontStylesheetUrl('https://evil.com/font.css')).toBe(false);
    expect(isAllowedGoogleFontStylesheetUrl('https://fonts.gstatic.com/x.css')).toBe(false);
    expect(isAllowedGoogleFontAssetHost('https://fonts.googleapis.com/css2?family=x')).toBe(false);
    expect(isAllowedGoogleFontsExternalRef('https://unpkg.com/foo.css')).toBe(false);
  });
});
