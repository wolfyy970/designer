import { afterEach, describe, expect, it, vi } from 'vitest';

describe('production API gates (NODE_ENV=production)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadProductionApp() {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { default: app } = await import('../../app.ts');
    return app;
  }

  it('GET /api/logs returns 404', async () => {
    const app = await loadProductionApp();
    const res = await app.request('http://localhost/api/logs');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/logs returns 404', async () => {
    const app = await loadProductionApp();
    const res = await app.request('http://localhost/api/logs', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('POST /api/logs/trace returns 404', async () => {
    const app = await loadProductionApp();
    const body = JSON.stringify({
      events: [
        {
          id: 'e1',
          at: new Date().toISOString(),
          kind: 'run_started',
          label: 'x',
        },
      ],
    });
    const res = await app.request('http://localhost/api/logs/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(404);
  });

  it('PUT /api/prompts/:key returns 404', async () => {
    const app = await loadProductionApp();
    const res = await app.request('http://localhost/api/prompts/designer-direct-system', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'not allowed in production' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/prompts/:key/revert-baseline returns 404', async () => {
    const app = await loadProductionApp();
    const res = await app.request(
      'http://localhost/api/prompts/designer-direct-system/revert-baseline',
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
  });
});
