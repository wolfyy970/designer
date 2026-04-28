import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { parsePreviewSessionFiles } from '../preview-session-files-request.ts';

describe('parsePreviewSessionFiles', () => {
  it('rejects invalid JSON', async () => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json({ ok: true });
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('Invalid JSON body');
  });

  it('rejects empty files map', async () => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json(r.files);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: {} }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('files must be non-empty');
  });

  it('returns files when valid', async () => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json({ count: Object.keys(r.files).length });
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'a.html': '<p>x</p>' } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });

  it('canonicalizes safe relative file paths', async () => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json(r.files);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { './pages/../index.html': '<p>x</p>' } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ 'index.html': '<p>x</p>' });
  });

  it.each([
    ['absolute path', '/index.html'],
    ['traversal path', '../index.html'],
    ['control character path', 'index\u0000.html'],
    ['empty path', './'],
  ])('rejects unsafe %s keys', async (_label, key) => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json(r.files);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [key]: '<p>x</p>' } }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('Invalid preview file path');
  });

  it('rejects duplicate normalized file keys', async () => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json(r.files);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'index.html': 'a', './index.html': 'b' } }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('Duplicate preview file path');
  });

  it('rejects file trees without a resolvable HTML entry', async () => {
    const app = new Hono();
    app.post('/t', async (c) => {
      const r = await parsePreviewSessionFiles(c);
      if (!r.ok) return r.response;
      return c.json(r.files);
    });
    const res = await app.request('http://localhost/t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'style.css': 'body{}' } }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('Preview files must include an HTML entry');
  });
});
