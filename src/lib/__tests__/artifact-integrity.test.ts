import { describe, expect, it } from 'vitest';

import { checkArtifactIntegrity, describeArtifactIntegrity } from '../artifact-integrity';

const HTML = (head: string, body = '<h1>Design</h1>') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe('checkArtifactIntegrity', () => {
  it('reports a complete tree as complete', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML(
        '<link rel="stylesheet" href="styles.css"><script src="app.js"></script>',
      ),
      'styles.css': 'body{}',
      'app.js': 'console.log(1)',
    });

    expect(result).toEqual({ entry: 'index.html', missing: [], incomplete: false });
  });

  it('flags the exact partial-build case: entry references files that were never written', () => {
    // Reproduces an aborted build: index.html landed, its assets did not.
    const result = checkArtifactIntegrity({
      'index.html': HTML(
        '<link rel="stylesheet" href="styles.css"><script src="app.js"></script>',
      ),
      'content.js': 'export const x = 1;',
    });

    expect(result.incomplete).toBe(true);
    expect(result.missing).toEqual(['app.js', 'styles.css']);
  });

  it('ignores external URLs, data URIs and fragment links', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML(
        [
          '<link rel="preconnect" href="https://fonts.googleapis.com">',
          '<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">',
          '<a href="#section">jump</a>',
          '<img src="data:image/png;base64,AAAA">',
          '<a href="mailto:hi@example.com">mail</a>',
        ].join(''),
        '<div id="section"></div>',
      ),
    });

    expect(result.missing).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('resolves refs relative to the entry document directory', () => {
    const result = checkArtifactIntegrity({
      'pages/index.html': HTML('<link rel="stylesheet" href="../styles.css">'),
      'styles.css': 'body{}',
    });

    // `../styles.css` from pages/ resolves to the root styles.css, which exists.
    expect(result).not.toBeNull();
    expect(result.incomplete).toBe(false);
  });

  it('detects a missing nested asset', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML('<script src="js/app.js"></script>'),
    });

    expect(result.missing).toEqual(['js/app.js']);
  });

  it('deduplicates a file referenced more than once', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML(
        '<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="./styles.css">',
      ),
    });

    expect(result.missing).toEqual(['styles.css']);
  });

  it('detects a missing asset on a page other than the entry', () => {
    /**
     * Multi-page artifacts link their stylesheet from every page. Scanning only
     * the entry declared this tree complete while `pages/menu.html` rendered
     * unstyled — the same broken-CSS symptom, in a tree the check had cleared.
     */
    const result = checkArtifactIntegrity({
      'index.html': HTML('<a href="pages/menu.html">Menu</a>'),
      'pages/menu.html': HTML('<link rel="stylesheet" href="menu.css">'),
    });

    expect(result.incomplete).toBe(true);
    expect(result.missing).toEqual(['pages/menu.css']);
  });

  it('resolves each reference against the document that contains it', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML('<a href="pages/menu.html">Menu</a>'),
      'pages/menu.html': HTML('<link rel="stylesheet" href="menu.css">'),
      'pages/menu.css': 'body { color: red; }',
    });

    expect(result.missing).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('does not report a cross-page link that exists', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML('<a href="pages/menu.html">Menu</a>'),
      'pages/menu.html': HTML('<h1>Menu</h1>'),
    });

    expect(result.incomplete).toBe(false);
  });

  it('reports a cross-page link that dangles', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML('<a href="pages/missing.html">Gone</a>'),
    });

    expect(result.missing).toEqual(['pages/missing.html']);
  });

  it('ignores a fragment-only link on any page', () => {
    const result = checkArtifactIntegrity({
      'index.html': HTML('<a href="#top">Top</a>'),
      'pages/menu.html': HTML('<a href="#menu">Menu</a><h1>M</h1>'),
    });

    expect(result.incomplete).toBe(false);
  });

  it('ignores assets referenced from non-HTML files', () => {
    // CSS `url(...)` is out of scope: the check covers markup references only.
    const result = checkArtifactIntegrity({
      'index.html': HTML('<link rel="stylesheet" href="styles.css">'),
      'styles.css': 'body { background: url("missing.png"); }',
    });

    expect(result.incomplete).toBe(false);
  });

  it('returns no entry when the tree has no HTML content to check', () => {
    const result = checkArtifactIntegrity({ 'app.js': 'console.log(1)' });

    // `entry` is null rather than the fallback path, because there is no
    // document to inspect — and that is not the same as "incomplete".
    expect(result).toEqual({ entry: null, missing: [], incomplete: false });
  });

  it('handles an empty tree', () => {
    expect(checkArtifactIntegrity({})).toEqual({
      entry: null,
      missing: [],
      incomplete: false,
    });
  });
});

describe('describeArtifactIntegrity', () => {
  it('returns empty copy for a complete artifact', () => {
    expect(
      describeArtifactIntegrity({ entry: 'index.html', missing: [], incomplete: false }),
    ).toBe('');
  });

  it('names the missing files and says the preview is not the finished design', () => {
    const msg = describeArtifactIntegrity({
      entry: 'index.html',
      missing: ['app.js', 'styles.css'],
      incomplete: true,
    });

    expect(msg).toContain('Build incomplete');
    expect(msg).toContain('app.js');
    expect(msg).toContain('styles.css');
    expect(msg).toContain('not the finished design');
  });

  it('summarises long lists instead of printing them all', () => {
    const msg = describeArtifactIntegrity({
      entry: 'index.html',
      missing: ['a.css', 'b.css', 'c.css', 'd.css', 'e.css'],
      incomplete: true,
    });

    expect(msg).toContain('5 referenced files');
    expect(msg).toContain('+2 more');
    expect(msg).not.toContain('e.css');
  });

  it('uses singular copy for one missing file', () => {
    const msg = describeArtifactIntegrity({
      entry: 'index.html',
      missing: ['styles.css'],
      incomplete: true,
    });

    expect(msg).toContain('1 referenced file missing');
  });
});
