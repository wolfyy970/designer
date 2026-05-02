import { describe, it, expect, vi } from 'vitest';
import { safeBridgeEmit, type PiSessionBridgeContext } from '../pi-bridge-core.ts';
import type { AgentRunEvent } from '../agent-runtime.ts';

function minimalCtx(
  overrides: Partial<PiSessionBridgeContext> = {},
): PiSessionBridgeContext {
  return {
    onEvent: vi.fn().mockResolvedValue(undefined),
    trace: vi.fn((kind, label, extra) => ({
      type: 'trace' as const,
      trace: {
        id: 't',
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
    ...overrides,
  };
}

describe('safeBridgeEmit', () => {
  it('invokes onStreamDeliveryFailure when onEvent rejects', async () => {
    const onStreamDeliveryFailure = vi.fn();
    const ctx = minimalCtx({
      onEvent: vi.fn().mockRejectedValue(new Error('sse write failed')),
      onStreamDeliveryFailure,
    });
    const ev: AgentRunEvent = { type: 'activity', payload: 'hi' };
    safeBridgeEmit(ctx, ev);
    await vi.waitFor(() => {
      expect(onStreamDeliveryFailure).toHaveBeenCalled();
    });
  });

  it('does not throw when onEvent resolves', async () => {
    const ctx = minimalCtx();
    safeBridgeEmit(ctx, { type: 'progress', payload: 'ok' });
    await vi.waitFor(() => {
      expect(ctx.onEvent).toHaveBeenCalled();
    });
  });
});
