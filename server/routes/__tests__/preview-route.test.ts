import { describe, it, expect, afterEach } from 'vitest';
import app from '../../app.ts';
import { clearPreviewSessionsForTests } from '../../services/preview-session-store.ts';

describe('preview routes', () => {
  afterEach(() => {
    clearPreviewSessionsForTests();
  });

  it('POST /api/preview/sessions registers files and GET serves nested paths', async () => {
    const post = await app.request('http://localhost/api/preview/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: {
          'index.html': '<!DOCTYPE html><html><head><link rel="stylesheet" href="css/a.css"></head><body>Hi</body></html>',
          'css/a.css': 'body { color: red; }',
          'pages/other.html': '<!DOCTYPE html><html><body>Other</body></html>',
        },
      }),
    });
    expect(post.status).toBe(200);
    const { id, entry } = (await post.json()) as { id: string; entry: string };
    expect(entry).toBe('index.html');
    expect(id.length).toBeGreaterThan(10);

    const htmlRes = await app.request(
      `http://localhost/api/preview/sessions/${id}/index.html`,
    );
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type') ?? '').toContain('text/html');

    const cssRes = await app.request(`http://localhost/api/preview/sessions/${id}/css/a.css`);
    expect(cssRes.status).toBe(200);
    expect(await cssRes.text()).toContain('color: red');

    const nested = await app.request(
      `http://localhost/api/preview/sessions/${id}/pages/other.html`,
    );
    expect(nested.status).toBe(200);
    expect(await nested.text()).toContain('Other');
  });

  it('GET /sessions/:id redirects to resolved entry', async () => {
    const post = await app.request('http://localhost/api/preview/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { 'about.html': '<!DOCTYPE html><html><body>A</body></html>' },
      }),
    });
    const { id } = (await post.json()) as { id: string };
    const redir = await app.request(`http://localhost/api/preview/sessions/${id}`, {
      redirect: 'manual',
    });
    expect(redir.status).toBe(302);
    const loc = redir.headers.get('location') ?? '';
    expect(loc).toContain(`/api/preview/sessions/${id}/`);
    expect(loc).toContain('about.html');
  });
});
