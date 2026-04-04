/**
 * Bridge Pi `AgentSession` events → app `AgentRunEvent` SSE payloads.
 */
import type { AgentSessionEvent, AgentSession, AssistantMessage } from './pi-sdk/types.ts';
import { appendLlmCallResponse } from '../log-store.ts';
import { debugAgentIngest } from '../lib/debug-agent-ingest.ts';
import { parsePiToolExecutionArgs } from '../lib/pi-tool-args.ts';
import { stripProviderControlTokens } from '../lib/stream-sanitize.ts';
import type { AgentRunEvent } from './pi-agent-run-types.ts';
import type { RunTraceEvent } from '../../src/types/provider.ts';

export interface PiSessionBridgeContext {
  onEvent: (event: AgentRunEvent) => void | Promise<void>;
  trace: (
    kind: RunTraceEvent['kind'],
    label: string,
    extra?: Partial<RunTraceEvent>,
  ) => AgentRunEvent;
  toolPathByCallId: Map<string, string | undefined>;
  waitingForFirstToken: { current: boolean };
  turnLogRef: { current?: string };
  streamActivityAt: { current: number };
  modelTurnId: { current: number };
  /** Mirror of in-flight Pi tool calls (for stall diagnostics). */
  pendingToolCallsRef?: { current: number };
}

/** Fire-and-forget async `onEvent` without unhandled rejections (e.g. SSE write failures). */
function safeBridgeEmit(ctx: PiSessionBridgeContext, event: AgentRunEvent): void {
  void Promise.resolve(ctx.onEvent(event)).catch((e) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[bridge] onEvent failed', e);
    }
  });
}

function emitFirstTokenIfNeeded(ctx: PiSessionBridgeContext): void {
  if (ctx.waitingForFirstToken.current) {
    ctx.waitingForFirstToken.current = false;
    safeBridgeEmit(
      ctx,
      ctx.trace('model_first_token', 'First streamed model token received', {
        phase: 'building',
        status: 'success',
      }),
    );
  }
}

function toolStartProgressPayload(
  toolName: string,
  path: string | undefined,
  _pattern: string | undefined,
  command?: string,
): string {
  if (toolName === 'bash') {
    const c = command ?? '';
    const short = c.length > 120 ? `${c.slice(0, 117)}…` : c;
    return short ? `Running: ${short}` : 'Running shell command…';
  }
  switch (toolName) {
    case 'validate_js':
    case 'validate_html':
      return `Validating ${path ?? 'file'}…`;
    case 'todo_write':
      return 'Updating tasks…';
    case 'use_skill':
      return path ? `Loading skill: ${path}…` : 'Loading skill…';
    default:
      return `Running ${toolName}…`;
  }
}

function bumpStreamActivity(ctx: PiSessionBridgeContext): void {
  ctx.streamActivityAt.current = Date.now();
}

function syncPendingToolProbe(ctx: PiSessionBridgeContext, toolStartMs: Map<string, number>) {
  if (ctx.pendingToolCallsRef) ctx.pendingToolCallsRef.current = toolStartMs.size;
}

/** Exported for tests (throttle between streaming_tool SSE payloads during toolcall_delta). */
export const STREAMING_TOOL_EMIT_INTERVAL_MS = 500;

interface StreamingToolAcc {
  toolName: string;
  toolPath?: string;
  streamedChars: number;
  lastEmitAt: number;
}

const TOOL_PATH_ARG_KEYS = ['path', 'file', 'filePath', 'target_file'] as const;

/** Shared path resolution for Pi tool argument objects (partial + finalized tool calls). */
export function toolPathFromArgsRecord(args: Record<string, unknown> | undefined): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  for (const key of TOOL_PATH_ARG_KEYS) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function toolMetaFromPartial(
  partial: AssistantMessage,
  contentIndex: number,
): { toolName: string; toolPath?: string } {
  const slice = partial.content[contentIndex];
  if (
    slice &&
    typeof slice === 'object' &&
    'type' in slice &&
    (slice as { type?: string }).type === 'toolCall'
  ) {
    const tc = slice as { name?: string; arguments?: Record<string, unknown> };
    const toolName = typeof tc.name === 'string' && tc.name.length > 0 ? tc.name : 'tool';
    const toolPath = toolPathFromArgsRecord(tc.arguments);
    return { toolName, toolPath };
  }
  return { toolName: 'tool' };
}

function toolPathFromToolCall(toolCall: { name?: string; arguments?: Record<string, unknown> }): string | undefined {
  return toolPathFromArgsRecord(toolCall.arguments);
}

/** text_delta and thinking_delta share append + emit behavior; only SSE event shape differs. */
function handleAssistantTextStreamDelta(
  ctx: PiSessionBridgeContext,
  rawDelta: string | undefined,
  kind: 'activity' | 'thinking',
): void {
  if (!rawDelta) return;
  emitFirstTokenIfNeeded(ctx);
  const delta = stripProviderControlTokens(rawDelta);
  if (!delta) return;
  bumpStreamActivity(ctx);
  const logId = ctx.turnLogRef.current;
  if (logId) appendLlmCallResponse(logId, delta);
  if (kind === 'activity') {
    safeBridgeEmit(ctx, { type: 'activity', payload: delta });
    return;
  }
  safeBridgeEmit(ctx, {
    type: 'thinking',
    payload: delta,
    turnId: ctx.modelTurnId.current,
  });
}

type BridgeMaps = {
  toolStartMs: Map<string, number>;
  streamingToolByIndex: Map<number, StreamingToolAcc>;
};

function handleTurnStart(ctx: PiSessionBridgeContext, maps: BridgeMaps): void {
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  ctx.modelTurnId.current += 1;
  safeBridgeEmit(ctx, { type: 'progress', payload: 'Model turn…' });
  ctx.waitingForFirstToken.current = true;
  safeBridgeEmit(
    ctx,
    ctx.trace('model_turn_start', 'Model turn started', {
      phase: 'building',
    }),
  );
  debugAgentIngest({
    hypothesisId: 'H1',
    location: 'pi-session-event-bridge.ts:turn_start',
    message: 'model turn_start',
    data: {
      modelTurnId: ctx.modelTurnId.current,
      pendingToolCalls: toolStartMs.size,
    },
  });
  syncPendingToolProbe(ctx, toolStartMs);
}

function handleMessageUpdate(
  ctx: PiSessionBridgeContext,
  maps: BridgeMaps,
  event: Extract<AgentSessionEvent, { type: 'message_update' }>,
): void {
  const msg = event.assistantMessageEvent;
  const { streamingToolByIndex } = maps;

  switch (msg.type) {
    case 'text_delta': {
      handleAssistantTextStreamDelta(ctx, msg.delta, 'activity');
      return;
    }
    case 'thinking_delta': {
      handleAssistantTextStreamDelta(ctx, msg.delta, 'thinking');
      return;
    }
    case 'toolcall_start': {
      emitFirstTokenIfNeeded(ctx);
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      const { toolName, toolPath } = toolMetaFromPartial(msg.partial, idx);
      const now = Date.now();
      streamingToolByIndex.set(idx, {
        toolName,
        toolPath,
        streamedChars: 0,
        lastEmitAt: now,
      });
      safeBridgeEmit(ctx, {
        type: 'streaming_tool',
        toolName,
        streamedChars: 0,
        done: false,
        ...(toolPath != null ? { toolPath } : {}),
      });
      return;
    }
    case 'toolcall_delta': {
      if (!msg.delta) return;
      emitFirstTokenIfNeeded(ctx);
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      let acc = streamingToolByIndex.get(idx);
      if (!acc) {
        const meta = toolMetaFromPartial(msg.partial, idx);
        const now = Date.now();
        acc = {
          toolName: meta.toolName,
          toolPath: meta.toolPath,
          streamedChars: 0,
          lastEmitAt: now,
        };
        streamingToolByIndex.set(idx, acc);
      }
      const pathFromPartial = toolMetaFromPartial(msg.partial, idx).toolPath;
      if (pathFromPartial && !acc.toolPath) acc.toolPath = pathFromPartial;
      acc.streamedChars += msg.delta.length;
      const t = Date.now();
      if (t - acc.lastEmitAt >= STREAMING_TOOL_EMIT_INTERVAL_MS) {
        acc.lastEmitAt = t;
        safeBridgeEmit(ctx, {
          type: 'streaming_tool',
          toolName: acc.toolName,
          streamedChars: acc.streamedChars,
          done: false,
          ...(acc.toolPath != null ? { toolPath: acc.toolPath } : {}),
        });
      }
      return;
    }
    case 'toolcall_end': {
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      const acc = streamingToolByIndex.get(idx);
      const tc = msg.toolCall as { name?: string; arguments?: Record<string, unknown> };
      const toolName =
        (typeof tc?.name === 'string' && tc.name.length > 0 ? tc.name : acc?.toolName) ?? 'tool';
      const toolPath = toolPathFromToolCall(tc) ?? acc?.toolPath;
      const streamedChars = acc?.streamedChars ?? 0;
      streamingToolByIndex.delete(idx);
      safeBridgeEmit(ctx, {
        type: 'streaming_tool',
        toolName,
        streamedChars,
        done: true,
        ...(toolPath != null ? { toolPath } : {}),
      });
      return;
    }
    default:
      return;
  }
}

function handleToolExecutionStart(ctx: PiSessionBridgeContext, maps: BridgeMaps, event: AgentSessionEvent): void {
  if (event.type !== 'tool_execution_start') return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const tn = event.toolName;
  const rawArgs = event.args as Record<string, unknown> | undefined;
  const command = typeof rawArgs?.command === 'string' ? rawArgs.command : undefined;
  const { path, pattern } = parsePiToolExecutionArgs(tn, event.args);
  const reusedToolCallId = toolStartMs.has(event.toolCallId);
  toolStartMs.set(event.toolCallId, Date.now());
  debugAgentIngest({
    hypothesisId: 'H2',
    location: 'pi-session-event-bridge.ts:tool_execution_start',
    message: 'tool_execution_start',
    data: {
      toolCallId: event.toolCallId,
      toolName: tn,
      path,
      pattern,
      reusedToolCallId,
      commandPreview: command != null && command.length > 160 ? `${command.slice(0, 157)}…` : command,
      pendingAfter: toolStartMs.size,
    },
  });
  syncPendingToolProbe(ctx, toolStartMs);
  ctx.toolPathByCallId.set(event.toolCallId, path);
  safeBridgeEmit(
    ctx,
    ctx.trace('tool_started', path ? `${tn} → ${path}` : `Started ${tn}`, {
      phase: 'building',
      toolName: tn,
      path,
    }),
  );
  safeBridgeEmit(ctx, {
    type: 'progress',
    payload: toolStartProgressPayload(tn, path, pattern, command),
  });
}

function handleToolExecutionEnd(ctx: PiSessionBridgeContext, maps: BridgeMaps, event: AgentSessionEvent): void {
  if (event.type !== 'tool_execution_end') return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const started = toolStartMs.get(event.toolCallId);
  const durationMs = started != null ? Date.now() - started : undefined;
  toolStartMs.delete(event.toolCallId);
  debugAgentIngest({
    hypothesisId: started == null ? 'H3' : 'H2',
    location: 'pi-session-event-bridge.ts:tool_execution_end',
    message: 'tool_execution_end',
    data: {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      isError: event.isError,
      durationMs,
      hadMatchedStart: started != null,
      orphanEnd: started == null,
      pendingAfter: toolStartMs.size,
    },
  });
  syncPendingToolProbe(ctx, toolStartMs);
  if (event.isError) {
    const path = ctx.toolPathByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace('tool_failed', `Tool failed: ${event.toolName}`, {
        phase: 'building',
        toolName: event.toolName,
        path,
        status: 'error',
      }),
    );
    safeBridgeEmit(ctx, {
      type: 'progress',
      payload: `Tool failed: ${event.toolName}`,
    });
  } else {
    const path = ctx.toolPathByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace('tool_finished', `Finished ${event.toolName}`, {
        phase: 'building',
        toolName: event.toolName,
        path,
        status: 'success',
      }),
    );
  }
  ctx.toolPathByCallId.delete(event.toolCallId);
}

function handleCompactionStart(ctx: PiSessionBridgeContext): void {
  safeBridgeEmit(ctx, { type: 'progress', payload: 'Compacting context…' });
  safeBridgeEmit(
    ctx,
    ctx.trace('compaction', 'Compacting context window', {
      phase: 'building',
    }),
  );
}

/** Subscribe until `unsubscribe()`; call when the agent session is ready. */
export function subscribePiSessionBridge(session: AgentSession, ctx: PiSessionBridgeContext): () => void {
  const maps: BridgeMaps = {
    toolStartMs: new Map<string, number>(),
    streamingToolByIndex: new Map<number, StreamingToolAcc>(),
  };
  syncPendingToolProbe(ctx, maps.toolStartMs);
  return session.subscribe((event: AgentSessionEvent) => {
    let handled = false;
    switch (event.type) {
      case 'turn_start':
        handled = true;
        handleTurnStart(ctx, maps);
        return;
      case 'message_update':
        handled = true;
        handleMessageUpdate(ctx, maps, event);
        return;
      case 'tool_execution_start':
        handled = true;
        handleToolExecutionStart(ctx, maps, event);
        return;
      case 'tool_execution_end':
        handled = true;
        handleToolExecutionEnd(ctx, maps, event);
        return;
      case 'compaction_start':
        handled = true;
        handleCompactionStart(ctx);
        return;
      default:
        break;
    }
    if (!handled && process.env.NODE_ENV !== 'production') {
      console.debug('[bridge] unhandled Pi event type:', (event as { type?: string }).type);
    }
  });
}
