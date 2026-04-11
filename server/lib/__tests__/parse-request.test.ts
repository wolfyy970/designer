import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseRequestJson } from '../parse-request.ts';

describe('parseRequestJson', () => {
  it('returns ok with parsed data when body is valid JSON and passes schema', async () => {
    const app = new Hono();
    const schema = z.object({ a: z.number() });
    app.post('/t', async (c) => {
      const r = await parseRequestJson(c, schema);
      if (!r.ok) return r.response;
      return c.json(r.data);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('returns 400 Invalid JSON body when body is not valid JSON', async () => {
    const app = new Hono();
    const schema = z.object({ a: z.number() });
    app.post('/t', async (c) => {
      const r = await parseRequestJson(c, schema);
      if (!r.ok) return r.response;
      return c.json(r.data);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('Invalid JSON body');
  });

  it('returns 400 Invalid request when JSON parses but schema fails', async () => {
    const app = new Hono();
    const schema = z.object({ a: z.number() });
    app.post('/t', async (c) => {
      const r = await parseRequestJson(c, schema);
      if (!r.ok) return r.response;
      return c.json(r.data);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'not-a-number' }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string; details?: unknown };
    expect(json.error).toBe('Invalid request');
    expect(json.details).toBeDefined();
  });
});
