import { describe, it, expect, vi } from 'vitest';
import { runTaskAgentSseBody } from '../sse-task-route.ts';
import { SSE_EVENT_NAMES } from '../../../src/constants/sse-events.ts';

describe('runTaskAgentSseBody', () => {
  it('emits phase complete then done on success', async () => {
    const writes: { event: string; data: string }[] = [];
    const stream = {
      writeSSE: vi.fn(async (opts: { data: string; event: string; id: string }) => {
        writes.push({ event: opts.event, data: opts.data });
      }),
    };
    await runTaskAgentSseBody(stream, async ({ write }) => {
      await write(SSE_EVENT_NAMES.activity, { entry: 'foo' });
    });
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes[0]!.event).toBe(SSE_EVENT_NAMES.activity);
    expect(writes[writes.length - 2]!.event).toBe(SSE_EVENT_NAMES.phase);
    expect(JSON.parse(writes[writes.length - 2]!.data)).toEqual({ phase: 'complete' });
    expect(writes[writes.length - 1]!.event).toBe(SSE_EVENT_NAMES.done);
    expect(writes[writes.length - 1]!.data).toBe('{}');
  });

  it('emits error then done when handler throws', async () => {
    const writes: { event: string; data: string }[] = [];
    const stream = {
      writeSSE: vi.fn(async (opts: { data: string; event: string; id: string }) => {
        writes.push({ event: opts.event, data: opts.data });
      }),
    };
    await runTaskAgentSseBody(stream, async () => {
      throw new Error('boom');
    });
    const errorIdx = writes.findIndex((w) => w.event === SSE_EVENT_NAMES.error);
    expect(errorIdx).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(writes[errorIdx]!.data)).toMatchObject({ error: expect.stringContaining('boom') });
    expect(writes.at(-1)?.event).toBe(SSE_EVENT_NAMES.done);
  });
});
