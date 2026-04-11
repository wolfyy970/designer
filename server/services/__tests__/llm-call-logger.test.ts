import { describe, expect, it, vi, beforeEach } from 'vitest';
import { withLlmCallLifecycle, type LlmLogContext } from '../llm-call-logger.ts';
import * as logStore from '../../log-store.ts';

vi.mock('../../log-store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof logStore>();
  return {
    ...actual,
    beginLlmCall: vi.fn(() => 'log-1'),
    finalizeLlmCall: vi.fn(),
    failLlmCall: vi.fn(),
    setLlmCallWaitingStatus: vi.fn(),
    setLlmCallResponseBody: vi.fn(),
    appendLlmCallResponse: vi.fn(),
  };
});

const ctx: LlmLogContext = { source: 'evaluator', phase: 'test' };

describe('withLlmCallLifecycle', () => {
  beforeEach(() => {
    vi.mocked(logStore.beginLlmCall).mockReturnValue('log-1');
    vi.clearAllMocks();
  });

  it('finalizes log on success', async () => {
    const upd = vi.fn();
    const res = await withLlmCallLifecycle(
      ctx,
      'm1',
      'openrouter',
      'sys',
      'user',
      undefined,
      upd,
      async () => ({ raw: 'ok', metadata: { promptTokens: 1 } }),
    );
    expect(res.raw).toBe('ok');
    expect(logStore.finalizeLlmCall).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ response: 'ok', promptTokens: 1 }),
    );
    expect(upd).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm1', input: expect.any(Object) }),
    );
    expect(logStore.failLlmCall).not.toHaveBeenCalled();
  });

  it('fails log and rethrows on error', async () => {
    const upd = vi.fn();
    await expect(
      withLlmCallLifecycle(ctx, 'm1', 'openrouter', 's', 'u', undefined, upd, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(logStore.failLlmCall).toHaveBeenCalledWith('log-1', 'boom', expect.any(Number));
    expect(logStore.finalizeLlmCall).not.toHaveBeenCalled();
  });

  it('calls onFirstStreamBody when provided from inner run', async () => {
    const upd = vi.fn();
    await withLlmCallLifecycle(
      ctx,
      'm1',
      'openrouter',
      's',
      'u',
      undefined,
      upd,
      async (h) => {
        h.onFirstStreamBody();
        return { raw: 'streamed' };
      },
    );
    expect(logStore.finalizeLlmCall).toHaveBeenCalled();
  });
});
