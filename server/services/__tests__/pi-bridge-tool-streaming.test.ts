import { describe, it, expect, vi } from 'vitest';
import { handleTurnStart, STREAMING_TOOL_EMIT_INTERVAL_MS } from '../pi-bridge-tool-streaming.ts';
import type { PiSessionBridgeContext } from '../pi-bridge-core.ts';
import { AGENTIC_PROGRESS_WORKING } from '../../lib/agentic-user-copy.ts';

describe('handleTurnStart', () => {
  it('increments modelTurnId and emits working progress', () => {
    const emitted: { type: string; payload?: string }[] = [];
    const ctx: PiSessionBridgeContext = {
      onEvent: vi.fn((e) => {
        emitted.push({ type: e.type, ...(e.type === 'progress' ? { payload: e.payload } : {}) });
      }),
      trace: vi.fn((kind, label, extra) => ({
        type: 'trace' as const,
        trace: {
          id: 'id',
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
    const maps = { toolStartMs: new Map<string, number>(), streamingToolByIndex: new Map() };
    handleTurnStart(ctx, maps);
    expect(ctx.modelTurnId.current).toBe(1);
    expect(ctx.waitingForFirstToken.current).toBe(true);
    expect(emitted.some((e) => e.type === 'progress' && e.payload === AGENTIC_PROGRESS_WORKING)).toBe(
      true,
    );
  });
});

describe('STREAMING_TOOL_EMIT_INTERVAL_MS', () => {
  it('is a positive throttle interval', () => {
    expect(STREAMING_TOOL_EMIT_INTERVAL_MS).toBeGreaterThan(0);
  });
});
