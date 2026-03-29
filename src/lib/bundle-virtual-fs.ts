/**
 * Pure bundling of multi-file HTML/CSS/JS for preview (no DOM).
 * Split from iframe-utils so Node/server code can import without DOM types.
 */

function generateMissingEntryShell(files: Record<string, string>): string {
  const fileList = Object.entries(files)
    .map(
      ([path, content]) =>
        `<h3 style="margin:16px 0 4px;font-family:monospace;color:#555">${path}</h3>` +
        `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow:auto;font-size:12px;margin:0">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Files</title></head>
<body style="font-family:system-ui;padding:20px;color:#333">
  <h2 style="color:#888">No index.html found — available files:</h2>
  ${fileList}
</body>
</html>`;
}

/**
 * Bundle a virtual filesystem into a single self-contained HTML string.
 * Inlines <link rel="stylesheet"> and <script src="..."> references.
 */
export function bundleVirtualFS(files: Record<string, string>): string {
  const htmlKey = Object.keys(files).find((p) => p.endsWith('.html')) ?? 'index.html';
  let html = files[htmlKey];
  if (!html) return generateMissingEntryShell(files);

  const scriptSrcClose = new RegExp(
    '<script\\s+([^>]*)src=(["\'])([^"\']+)\\2([^>]*)></script>',
    'gi',
  );

  html = html.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (match, href) => {
      if (href.startsWith('http')) return match;
      const key = href.replace(/^\.\//, '');
      const css = files[key];
      return css ? `<style>\n${css}\n</style>` : match;
    },
  );

  html = html.replace(scriptSrcClose, (match, before, _quote, src, after) => {
    void _quote;
    if (src.startsWith('http')) return match;
    const key = String(src).replace(/^\.\//, '');
    const js = files[key];
    return js ? `<script ${before}${after}>\n${js}\n</script>` : match;
  });

  return html;
}
