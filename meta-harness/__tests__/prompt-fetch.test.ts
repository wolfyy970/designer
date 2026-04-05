import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPromptBody } from '../prompt-fetch.ts';

describe('fetchPromptBody', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns body on OK JSON with string body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ body: 'prompt text' }),
    }) as unknown as typeof fetch;

    const r = await fetchPromptBody('http://127.0.0.1:3001/api', 'k1');
    expect(r.body).toBe('prompt text');
    expect(r.error).toBeUndefined();
  });

  it('maps 404 to fetchError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const r = await fetchPromptBody('http://127.0.0.1:3001/api', 'k1');
    expect(r.body).toBeNull();
    expect(r.error).toContain('not found');
  });

  it('returns empty-body error when body missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const r = await fetchPromptBody('http://127.0.0.1:3001/api', 'k1');
    expect(r.body).toBeNull();
    expect(r.error).toBe('empty body from API');
  });
});
