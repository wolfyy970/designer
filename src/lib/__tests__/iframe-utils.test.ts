import { describe, it, expect } from 'vitest';
import { bundleVirtualFS, prepareIframeContent, renderErrorHtml } from '../iframe-utils';

describe('bundleVirtualFS', () => {
  const baseHtml = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <script src="app.js" defer></script>
</body>
</html>`;

  it('inlines stylesheet link tags', () => {
    const result = bundleVirtualFS({
      'index.html': baseHtml,
      'styles.css': 'body { color: red; }',
    });
    expect(result).toContain('<style>');
    expect(result).toContain('body { color: red; }');
    expect(result).not.toContain('<link rel="stylesheet"');
  });

  it('inlines script src tags', () => {
    const result = bundleVirtualFS({
      'index.html': baseHtml,
      'app.js': 'console.log("hello");',
    });
    expect(result).toContain('<script');
    expect(result).toContain('console.log("hello");');
    expect(result).not.toContain('src="app.js"');
  });

  it('inlines both CSS and JS', () => {
    const result = bundleVirtualFS({
      'index.html': baseHtml,
      'styles.css': '.btn { display: flex; }',
      'app.js': 'alert(1);',
    });
    expect(result).toContain('.btn { display: flex; }');
    expect(result).toContain('alert(1);');
  });

  it('handles ./relative paths in HTML references', () => {
    const html = `<html><head><link rel="stylesheet" href="./styles.css"></head><body><script src="./app.js" defer></script></body></html>`;
    const result = bundleVirtualFS({
      'index.html': html,
      'styles.css': 'h1 { color: blue; }',
      'app.js': 'var x = 1;',
    });
    expect(result).toContain('h1 { color: blue; }');
    expect(result).toContain('var x = 1;');
  });

  it('leaves external URLs (http/https) untouched', () => {
    const html = `<html><head><link rel="stylesheet" href="https://cdn.example.com/style.css"></head><body></body></html>`;
    const result = bundleVirtualFS({ 'index.html': html });
    expect(result).toContain('href="https://cdn.example.com/style.css"');
  });

  it('leaves reference in place when file is missing', () => {
    const html = `<html><head><link rel="stylesheet" href="missing.css"></head><body></body></html>`;
    const result = bundleVirtualFS({ 'index.html': html });
    expect(result).toContain('href="missing.css"');
  });

  it('returns fallback shell when no index.html exists', () => {
    const result = bundleVirtualFS({
      'styles.css': 'body {}',
      'app.js': 'console.log(1);',
    });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('styles.css');
    expect(result).toContain('app.js');
  });

  it('uses non-index .html file when index.html is absent', () => {
    const result = bundleVirtualFS({
      'page.html': '<html><body>Custom</body></html>',
    });
    expect(result).toContain('Custom');
  });

  it('inlines assets using paths relative to entry HTML directory', () => {
    const html = `<html><head><link rel="stylesheet" href="local.css"></head><body><script src="local.js"></script></body></html>`;
    const result = bundleVirtualFS({
      'nested/entry.html': html,
      'nested/local.css': 'p { margin: 0; }',
      'nested/local.js': 'window.x = 1;',
    });
    expect(result).toContain('p { margin: 0; }');
    expect(result).toContain('window.x = 1;');
    expect(result).not.toContain('href="local.css"');
  });
});

describe('prepareIframeContent', () => {
  it('passes through HTML unchanged', () => {
    const html = '<!DOCTYPE html><html><body>Hi</body></html>';
    expect(prepareIframeContent(html)).toBe(html);
  });

  it('passes through any code unchanged', () => {
    const code = 'function App() { return <div>Hello</div>; }';
    expect(prepareIframeContent(code)).toBe(code);
  });
});

describe('renderErrorHtml', () => {
  it('wraps error message in HTML', () => {
    const result = renderErrorHtml('Something broke');
    expect(result).toContain('Something broke');
    expect(result).toContain('Rendering Error');
    expect(result).toContain('<!DOCTYPE html>');
  });
});
