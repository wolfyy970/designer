import { describe, expect, it, afterEach } from 'vitest';
import app from '../../app.ts';
import { clearPreviewSessionsForTests } from '../../services/preview-session-store.ts';
import { checkArtifactIntegrity } from '../../../src/lib/artifact-integrity.ts';
import { bundleVirtualFS } from '../../../src/lib/bundle-virtual-fs.ts';

/**
 * Reproduces the "preview renders unstyled" report by walking the real streaming
 * sequence: during an agentic build `liveFiles` gains entries one at a time, and
 * the preview iframe re-registers on every change. Each stage below is a real
 * snapshot of that map, served through the real route, with subresource requests
 * issued the way a browser resolves them relative to the entry URL.
 *
 * The point is to find which layer is responsible: the artifact, the route, or
 * the fallback bundler.
 */

const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head>
<body><div id="app">Culinary Imagination Engine</div><script src="app.js"></script></body></html>`;
const CSS = 'body { font-family: system-ui; background: #101014; color: #eee; }';
const JS = 'document.getElementById("app").dataset.ready = "1";';

async function register(files: Record<string, string>) {
  const res = await app.request('http://localhost/api/preview/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; entry: string };
}

/** Resolve a subresource the way the browser does: relative to the entry URL. */
function resolveAsBrowser(entryUrl: string, ref: string): string {
  return new URL(ref, entryUrl).toString();
}

describe('live preview during a multi-file build', () => {
  afterEach(() => {
    clearPreviewSessionsForTests();
  });

  it('serves the stylesheet the entry references at the browser-resolved URL', async () => {
    const { id, entry } = await register({
      'index.html': HTML,
      'styles.css': CSS,
      'app.js': JS,
    });
    const entryUrl = `http://localhost/api/preview/sessions/${id}/${entry}`;

    const htmlRes = await app.request(entryUrl);
    expect(htmlRes.status).toBe(200);

    for (const ref of ['styles.css', 'app.js']) {
      const res = await app.request(resolveAsBrowser(entryUrl, ref));
      expect(res.status, `${ref} subresource`).toBe(200);
    }

    const cssRes = await app.request(resolveAsBrowser(entryUrl, 'styles.css'));
    expect(cssRes.headers.get('content-type') ?? '').toContain('text/css');
  });

  it('stage 1 — index.html alone: what does the viewer actually get?', async () => {
    // Realistic first snapshot: the agent wrote the markup before the assets.
    const files = { 'index.html': HTML };
    const { id, entry } = await register(files);
    const entryUrl = `http://localhost/api/preview/sessions/${id}/${entry}`;

    const cssRes = await app.request(resolveAsBrowser(entryUrl, 'styles.css'));
    const jsRes = await app.request(resolveAsBrowser(entryUrl, 'app.js'));

    // Documents the failure the viewer sees: markup arrives, styles 404, so the
    // frame paints unstyled. This is what "it doesn't render / broken CSS" is.
    expect(cssRes.status).toBe(404);
    expect(jsRes.status).toBe(404);

    // The integrity check *does* detect it (that is what the banner is for)...
    const integrity = checkArtifactIntegrity(files);
    expect(integrity.incomplete).toBe(true);
    expect(integrity.missing).toEqual(['app.js', 'styles.css']);

    // ...but the srcDoc fallback does NOT repair it: the missing <link>/<script>
    // are left in place, so the fallback is exactly as unstyled as the URL path.
    const bundled = bundleVirtualFS(files);
    expect(bundled).toContain('href="styles.css"');
    expect(bundled).not.toContain('<style>');
  });

  it('marks a transient miss uncacheable so it cannot outlive the missing file', async () => {
    const files = { 'index.html': HTML };
    const { id, entry } = await register(files);
    const entryUrl = `http://localhost/api/preview/sessions/${id}/${entry}`;

    const miss = await app.request(resolveAsBrowser(entryUrl, 'styles.css'));
    expect(miss.status).toBe(404);
    // Mid-build 404s are transient by construction. Without `no-store` they are
    // heuristically cacheable and a cached miss outlives the file, which kept the
    // frame unstyled long after the stylesheet existed.
    expect(miss.headers.get('cache-control')).toBe('no-store');
  });

  it('recovers once the assets land in the same session', async () => {
    const files: Record<string, string> = { 'index.html': HTML };
    const { id, entry } = await register(files);
    const entryUrl = `http://localhost/api/preview/sessions/${id}/${entry}`;
    expect((await app.request(resolveAsBrowser(entryUrl, 'styles.css'))).status).toBe(404);

    // Simulate the next liveFiles snapshot: assets written, session replaced.
    const put = await app.request(`http://localhost/api/preview/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { ...files, 'styles.css': CSS, 'app.js': JS } }),
    });
    expect(put.status).toBe(200);

    const cssAfter = await app.request(resolveAsBrowser(entryUrl, 'styles.css'));
    expect(cssAfter.status).toBe(200);
    expect(await cssAfter.text()).toContain('system-ui');
  });
});
