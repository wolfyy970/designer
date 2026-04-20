import { describe, it, expect, vi } from 'vitest';
import { handleAgentEnd, handleCompactionStart } from '../pi-bridge-compaction-agent.ts';
import type { PiSessionBridgeContext } from '../pi-bridge-core.ts';

function ctxWithEmit(): PiSessionBridgeContext & { emitted: AgentRunEvent[] } {
  const emitted: AgentRunEvent[] = [];
  return {
    emitted,
    onEvent: vi.fn(async (e) => {
      emitted.push(e);
    }),
    trace: vi.fn((kind, label, extra) => ({
      type: 'trace' as const,
      trace: {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind,
        label,
        ...extra,
      },
    })),
    toolPathByCallId: new Map(),
    toolArgsByCallId: new Map(),
    waitingForFirstToken: { current: false },
    turnLogRef: {},
    streamActivityAt: { current: 0 },
    modelTurnId: { current: 0 },
  };
}

import type { AgentRunEvent } from '../pi-agent-run-types.ts';

describe('handleCompactionStart', () => {
  it('emits progress and trace', async () => {
    const ctx = ctxWithEmit();
    handleCompactionStart(ctx, { type: 'compaction_start', reason: 'threshold' });
    expect(ctx.onEvent).toHaveBeenCalled();
    const types = ctx.emitted.map((e) => e.type);
    expect(types).toContain('progress');
    expect(types).toContain('trace');
  });
});

describe('handleAgentEnd', () => {
  it('emits error and trace when last assistant has stopReason error', async () => {
    const ctx = ctxWithEmit();
    handleAgentEnd(ctx, {
      type: 'agent_end',
      messages: [
        {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: 'upstream broke',
        },
      ],
    } as never);
    await vi.waitFor(() => {
      expect(ctx.emitted.some((e) => e.type === 'error')).toBe(true);
    });
    expect(ctx.emitted.some((e) => e.type === 'trace')).toBe(true);
  });

  it('no-op when agent_end without error stopReason', () => {
    const ctx = ctxWithEmit();
    handleAgentEnd(ctx, {
      type: 'agent_end',
      messages: [{ role: 'assistant', stopReason: 'stop' }],
    } as never);
    expect(ctx.emitted).toHaveLength(0);
  });
});
