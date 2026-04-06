import { afterEach, describe, expect, it, vi } from 'vitest';

describe('preview route limits (env overrides)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadPreviewApp(options: { maxPayloadBytes?: string; maxSessions?: string }) {
    vi.stubEnv('NODE_ENV', 'development');
    if (options.maxPayloadBytes !== undefined) {
      vi.stubEnv('MAX_PREVIEW_PAYLOAD_BYTES', options.maxPayloadBytes);
    }
    if (options.maxSessions !== undefined) {
      vi.stubEnv('MAX_PREVIEW_SESSIONS', options.maxSessions);
    }
    vi.resetModules();
    const { default: app } = await import('../../app.ts');
    return app;
  }

  it('returns 413 when files payload exceeds MAX_PREVIEW_PAYLOAD_BYTES', async () => {
    // Env clamps to a 64KiB floor — set cap at minimum and exceed it with file contents.
    const app = await loadPreviewApp({ maxPayloadBytes: `${64 * 1024}` });
    const longContent = 'x'.repeat(70_000);
    const res = await app.request('http://localhost/api/preview/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { 'i.html': longContent },
      }),
    });
    expect(res.status).toBe(413);
    const json = (await res.json()) as { error?: string };
    expect(String(json.error)).toMatch(/payload|large/i);
  });

  it('evicts oldest session when MAX_PREVIEW_SESSIONS is reached', async () => {
    const app = await loadPreviewApp({ maxSessions: '2' });
    const post = async (title: string) =>
      app.request('http://localhost/api/preview/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: { 'index.html': `<p>${title}</p>` },
        }),
      });

    const r1 = await post('first');
    expect(r1.status).toBe(200);
    const { id: id1 } = (await r1.json()) as { id: string };

    await new Promise((r) => setTimeout(r, 5));

    const r2 = await post('second');
    expect(r2.status).toBe(200);
    const { id: id2 } = (await r2.json()) as { id: string };

    await new Promise((r) => setTimeout(r, 5));

    const r3 = await post('third');
    expect(r3.status).toBe(200);

    const stale = await app.request(`http://localhost/api/preview/sessions/${id1}/index.html`);
    expect(stale.status).toBe(404);

    const kept = await app.request(`http://localhost/api/preview/sessions/${id2}/index.html`);
    expect(kept.status).toBe(200);

    expect(id1).not.toBe(id2);
  });
});
