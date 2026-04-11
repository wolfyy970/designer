import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { apiJsonError } from '../api-json-error.ts';

describe('apiJsonError', () => {
  it('returns { error } only when details omitted', async () => {
    const app = new Hono().get('/e', (c) => apiJsonError(c, 400, 'bad'));
    const res = await app.request('http://test/e');
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; details?: unknown };
    expect(json.error).toBe('bad');
    expect('details' in json).toBe(false);
  });

  it('includes details when provided', async () => {
    const app = new Hono().get('/e', (c) => apiJsonError(c, 422, 'bad', { foo: 1 }));
    const res = await app.request('http://test/e');
    const json = (await res.json()) as { error: string; details: unknown };
    expect(json.error).toBe('bad');
    expect(json.details).toEqual({ foo: 1 });
  });
});
