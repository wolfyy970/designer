import { describe, expect, it } from 'vitest';
import { classifyAssetRef, resolveVirtualAssetPath } from '../resolve-virtual-asset-path';

describe('resolveVirtualAssetPath', () => {
  it('root HTML + simple ref', () => {
    expect(resolveVirtualAssetPath('styles.css', 'index.html')).toBe('styles.css');
  });

  it('root HTML + ./styles.css', () => {
    expect(resolveVirtualAssetPath('./styles.css', 'index.html')).toBe('styles.css');
  });

  it('sub-page + same-level ref', () => {
    expect(resolveVirtualAssetPath('shared.css', 'pages/about.html')).toBe('pages/shared.css');
  });

  it('sub-page + parent traversal', () => {
    expect(resolveVirtualAssetPath('../styles.css', 'pages/about.html')).toBe('styles.css');
  });

  it('deeply nested + double parent', () => {
    expect(resolveVirtualAssetPath('../../css/style.css', 'pages/about/index.html')).toBe(
      'css/style.css',
    );
  });

  it('absolute path /css/style.css', () => {
    expect(resolveVirtualAssetPath('/css/style.css', 'pages/about.html')).toBe('css/style.css');
  });

  it('external https URL returns undefined', () => {
    expect(resolveVirtualAssetPath('https://example.com/x.css', 'index.html')).toBeUndefined();
  });

  it('data: URI returns undefined', () => {
    expect(resolveVirtualAssetPath('data:image/png;base64,xx', 'index.html')).toBeUndefined();
  });

  it('strips query and fragment', () => {
    expect(resolveVirtualAssetPath('app.js?v=1#frag', 'index.html')).toBe('app.js');
  });

  it('parent segments that escape above root collapse (empty string)', () => {
    expect(resolveVirtualAssetPath('../../', 'index.html')).toBe('');
  });
});

describe('classifyAssetRef', () => {
  it('classifies external, absolute, relative', () => {
    expect(classifyAssetRef('https://a.com/x')).toBe('external');
    expect(classifyAssetRef('//a.com/x')).toBe('external');
    expect(classifyAssetRef('/foo.css')).toBe('absolute');
    expect(classifyAssetRef('foo.css')).toBe('relative');
  });
});
