import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeGenerateStreamSafe } = vi.hoisted(() => ({
  executeGenerateStreamSafe: vi.fn(async () => {}),
}));

vi.mock('../../services/generate-execution.ts', () => ({
  executeGenerateStreamSafe,
  createWriteGate: vi.fn(() => ({ enqueue: (fn: () => void) => fn() })),
}));

import app from '../../app.ts';

const validBody = {
  prompt: 'hello',
  providerId: 'openrouter',
  modelId: 'm',
};

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when validation fails', async () => {
    const res = await app.request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '', providerId: 'x', modelId: 'y' }),
    });
    expect(res.status).toBe(400);
    expect(executeGenerateStreamSafe).not.toHaveBeenCalled();
  });

  it('dispatches to executeGenerateStreamSafe with body and abort signal', async () => {
    const ac = new AbortController();
    const res = await app.request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
      signal: ac.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(executeGenerateStreamSafe).toHaveBeenCalledOnce();
    const call = executeGenerateStreamSafe.mock.calls[0] as unknown as [
      unknown,
      { prompt: string; providerId: string },
      AbortSignal,
    ];
    const [, body, signal] = call;
    expect(body.prompt).toBe('hello');
    expect(body.providerId).toBe('openrouter');
    // Hono may wrap `Request`; route passes `c.req.raw.signal` (not always identical to test `signal:`).
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });
});
