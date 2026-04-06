import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLogs } from '../client.ts';

describe('getLogs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('treats 404 as ring unavailable with empty data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    const result = await getLogs();
    expect(result.ringAvailable).toBe(false);
    expect(result.data).toEqual({ llm: [], trace: [] });
    expect(fetch).toHaveBeenCalledWith('/api/logs');
  });

  it('parses OK response and sets ringAvailable true', async () => {
    const body = { llm: [], trace: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await getLogs();
    expect(result.ringAvailable).toBe(true);
    expect(result.data).toEqual(body);
  });
});
