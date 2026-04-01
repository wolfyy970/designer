import { describe, it, expect } from 'vitest';
import { globPatternToRegExp, pathMatchesGlob } from '../../lib/virtual-path-glob.ts';
import { VirtualWorkspace } from '../virtual-workspace.ts';

describe('virtual-path-glob', () => {
  it('matches single-segment *.html but not nested paths', () => {
    expect(pathMatchesGlob('index.html', '*.html')).toBe(true);
    expect(pathMatchesGlob('deep/x.html', '*.html')).toBe(false);
  });

  it('matches nested paths with **/*.html', () => {
    expect(pathMatchesGlob('deep/x.html', '**/*.html')).toBe(true);
    expect(pathMatchesGlob('a/b/c.html', '**/*.html')).toBe(true);
    expect(pathMatchesGlob('styles.css', '**/*.html')).toBe(false);
  });

  it('exposes globPatternToRegExp for anchored path checks', () => {
    expect(globPatternToRegExp('*.css').test('app.css')).toBe(true);
    expect(globPatternToRegExp('*.css').test('dir/app.css')).toBe(false);
  });
});

describe('VirtualWorkspace.grepContent', () => {
  it('returns ok:false for invalid regex pattern', () => {
    const ws = new VirtualWorkspace();
    ws.seed('a.css', 'x');
    const r = ws.grepContent({ pattern: '[bad' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Invalid pattern');
  });

  it('matches literal substring when literal=true', () => {
    const ws = new VirtualWorkspace();
    ws.seed('f.css', 'foo.bar\n');
    const r = ws.grepContent({ pattern: '.', literal: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('foo.bar');
      expect(r.matchCount).toBe(1);
    }
  });

  it('scopes to a single file when path is exact file', () => {
    const ws = new VirtualWorkspace();
    ws.seed('a.css', 'color: red;');
    ws.seed('b.css', 'color: red;');
    const r = ws.grepContent({ pattern: 'color', path: 'a.css' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('a.css');
      expect(r.text).not.toContain('b.css');
    }
  });

  it('scopes to path prefix', () => {
    const ws = new VirtualWorkspace();
    ws.seed('src/a.js', 'findme');
    ws.seed('root.js', 'findme');
    const r = ws.grepContent({ pattern: 'findme', path: 'src' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('src/a.js');
      expect(r.text).not.toContain('root.js');
    }
  });

  it('filters by glob on paths', () => {
    const ws = new VirtualWorkspace();
    ws.seed('x.css', 'token');
    ws.seed('y.js', 'token');
    const r = ws.grepContent({ pattern: 'token', glob: '*.css' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('x.css');
      expect(r.text).not.toContain('y.js');
    }
  });

  it('respects match limit', () => {
    const ws = new VirtualWorkspace();
    const lines = Array.from({ length: 40 }, () => 'hit');
    ws.seed('big.txt', lines.join('\n'));
    const r = ws.grepContent({ pattern: 'hit', limit: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.matchCount).toBe(10);
      expect(r.text).toContain('[10 match limit reached]');
    }
  });

  it('includes context lines around matches', () => {
    const ws = new VirtualWorkspace();
    ws.seed('t.css', 'a\nb\nc\nd\ne');
    const r = ws.grepContent({ pattern: '^c$', context: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('2:');
      expect(r.text).toContain('3>');
      expect(r.text).toContain('4:');
    }
  });

  it('does not add paths to readPaths', () => {
    const ws = new VirtualWorkspace();
    ws.seed('a.css', 'x');
    ws.grepContent({ pattern: 'x' });
    const snap = ws.getFileSnapshot();
    expect(snap.readFiles).not.toContain('a.css');
  });
});
