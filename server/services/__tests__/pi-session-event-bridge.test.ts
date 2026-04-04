import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AssistantMessage } from '../pi-sdk/types.ts';
import {
  subscribePiSessionBridge,
  STREAMING_TOOL_EMIT_INTERVAL_MS,
} from '../pi-session-event-bridge.ts';
import type { PiSessionBridgeContext } from '../pi-session-event-bridge.ts';
import type { AgentRunEvent } from '../pi-agent-run-types.ts';
import type { AgentSession } from '../pi-sdk/types.ts';

function mkPartial(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openrouter',
    model: 'm',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'toolUse',
    timestamp: 0,
  };
}

function traceFactory(): PiSessionBridgeContext['trace'] {
  return (kind, label, extra) => ({
    type: 'trace',
    trace: {
      id: 't1',
      at: new Date().toISOString(),
      kind,
      label,
      ...extra,
    },
  });
}

describe('subscribePiSessionBridge streaming_tool', () => {
  let listeners: Array<(e: unknown) => void>;
  let session: AgentSession;

  beforeEach(() => {
    listeners = [];
    session = {
      subscribe(fn: (e: unknown) => void) {
        listeners.push(fn);
        return () => {};
      },
    } as unknown as AgentSession;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function emit(e: unknown) {
    for (const l of listeners) l(e);
  }

  function makeCtx(): PiSessionBridgeContext {
    return {
      onEvent: () => Promise.resolve(),
      trace: traceFactory(),
      toolPathByCallId: new Map(),
      waitingForFirstToken: { current: false },
      turnLogRef: {},
      streamActivityAt: { current: 0 },
      modelTurnId: { current: 1 },
    };
  }

  it('emits streaming_tool on toolcall_start with path from partial arguments', () => {
    const out: AgentRunEvent[] = [];
    const ctx = makeCtx();
    ctx.onEvent = (ev) => {
      out.push(ev);
      return Promise.resolve();
    };
    subscribePiSessionBridge(session, ctx);
    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 1,
        partial: mkPartial([
          { type: 'text', text: '' },
          { type: 'toolCall', id: '1', name: 'write_file', arguments: { path: 'styles.css' } },
        ]),
      },
    });
    const st = out.filter((e): e is Extract<AgentRunEvent, { type: 'streaming_tool' }> => e.type === 'streaming_tool');
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({
      type: 'streaming_tool',
      toolName: 'write_file',
      streamedChars: 0,
      done: false,
      toolPath: 'styles.css',
    });
  });

  it('throttles streaming_tool during toolcall_delta and emits on toolcall_end', () => {
    vi.useFakeTimers({ now: 0 });
    const out: AgentRunEvent[] = [];
    const ctx = makeCtx();
    ctx.onEvent = (ev) => {
      out.push(ev);
      return Promise.resolve();
    };
    subscribePiSessionBridge(session, ctx);

    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 1,
        partial: mkPartial([
          { type: 'text', text: '' },
          { type: 'toolCall', id: '1', name: 'write_file', arguments: { path: 'a.css' } },
        ]),
      },
    });

    const partialMid = mkPartial([
      { type: 'text', text: '' },
      { type: 'toolCall', id: '1', name: 'write_file', arguments: { path: 'a.css' } },
    ]);

    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 1,
        delta: 'x'.repeat(100),
        partial: partialMid,
      },
    });

    let st = out.filter((e) => e.type === 'streaming_tool');
    expect(st).toHaveLength(1);

    vi.advanceTimersByTime(STREAMING_TOOL_EMIT_INTERVAL_MS);

    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 1,
        delta: 'y'.repeat(200),
        partial: partialMid,
      },
    });

    st = out.filter((e) => e.type === 'streaming_tool');
    expect(st.length).toBeGreaterThanOrEqual(2);
    const lastProgress = st.filter((e) => !e.done).pop() as Extract<AgentRunEvent, { type: 'streaming_tool' }>;
    expect(lastProgress.streamedChars).toBe(300);

    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_end',
        contentIndex: 1,
        toolCall: {
          type: 'toolCall',
          id: '1',
          name: 'write_file',
          arguments: { path: 'a.css', content: 'body{}' },
        },
        partial: partialMid,
      },
    });

    const doneEv = out.filter(
      (e): e is Extract<AgentRunEvent, { type: 'streaming_tool' }> =>
        e.type === 'streaming_tool' && e.done,
    );
    expect(doneEv).toHaveLength(1);
    expect(doneEv[0].streamedChars).toBe(300);
    expect(doneEv[0].toolPath).toBe('a.css');
  });

  it('bumps streamActivityAt on toolcall_delta', () => {
    vi.useFakeTimers({ now: 10_000 });
    const ctx = makeCtx();
    subscribePiSessionBridge(session, ctx);
    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: mkPartial([{ type: 'toolCall', id: '1', name: 'grep', arguments: {} }]),
      },
    });
    const t0 = ctx.streamActivityAt.current;
    vi.advanceTimersByTime(5);
    emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: 'abc',
        partial: mkPartial([{ type: 'toolCall', id: '1', name: 'grep', arguments: {} }]),
      },
    });
    expect(ctx.streamActivityAt.current).toBeGreaterThan(t0);
  });
});
