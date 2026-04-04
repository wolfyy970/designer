import { describe, it, expect } from 'vitest';
import {
  encodeVirtualPathForUrl,
  preferredArtifactFileOrder,
  resolvePreviewEntryPath,
} from '../preview-entry';

describe('resolvePreviewEntryPath', () => {
  it('prefers index.html when present', () => {
    expect(
      resolvePreviewEntryPath({
        'about.html': '<html></html>',
        'index.html': '<html>i</html>',
      }),
    ).toBe('index.html');
  });

  it('uses lexicographically first html when no index', () => {
    expect(
      resolvePreviewEntryPath({
        'z.html': '',
        'a/b.html': '',
      }),
    ).toBe('a/b.html');
  });

  it('defaults to index.html when no html files', () => {
    expect(resolvePreviewEntryPath({ 'a.css': '' })).toBe('index.html');
  });
});

describe('encodeVirtualPathForUrl', () => {
  it('normalizes slashes and encodes segments', () => {
    expect(encodeVirtualPathForUrl('\\pages\\about space.html')).toBe(
      'pages/about%20space.html',
    );
  });

  it('strips leading slashes', () => {
    expect(encodeVirtualPathForUrl('/x/y')).toBe('x/y');
  });
});

describe('preferredArtifactFileOrder', () => {
  it('puts index.html first then sorts rest', () => {
    expect(
      preferredArtifactFileOrder({
        'b.ts': '',
        'index.html': '',
        'a.css': '',
      }),
    ).toEqual(['index.html', 'a.css', 'b.ts']);
  });

  it('sorts all keys when no index', () => {
    expect(
      preferredArtifactFileOrder({
        'z.html': '',
        'a.html': '',
      }),
    ).toEqual(['a.html', 'z.html']);
  });
});
