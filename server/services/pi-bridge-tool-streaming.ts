/**
 * Pi bridge: turn lifecycle, assistant text streaming, tool execution, streaming_tool SSE.
 */
import {
  LOG_COMMAND_PREVIEW_HEAD_CHARS,
  LOG_COMMAND_PREVIEW_MAX,
  LOG_PREVIEW_SNIPPET_HEAD_CHARS,
  LOG_PREVIEW_SNIPPET_MAX,
} from '../lib/content-limits.ts';
import { appendLlmCallResponse } from '../log-store.ts';
import {
  AGENTIC_PROGRESS_WORKING,
  RUN_TRACE_LABEL_AGENT_WORKING,
} from '../lib/agentic-user-copy.ts';
import { debugAgentIngest } from '../lib/debug-agent-ingest.ts';
import { parsePiToolExecutionArgs } from '../lib/pi-tool-args.ts';
import {
  serializePiToolArgsForTrace,
  serializePiToolResultForTrace,
} from '../lib/pi-tool-trace.ts';
import { stripProviderControlTokens } from '../lib/stream-sanitize.ts';
import {
  extractToolPathFromAssistantPartial,
  parsePiToolCallEnd,
  parseUnknownArgsRecord,
  toolMetaFromPartialNarrowed,
  toolPathFromNarrowedToolCall,
} from '../lib/pi-bridge-narrowing.ts';
import type { AgentSessionEvent } from '@auto-designer/pi';
import type { PiSessionBridgeContext } from './pi-bridge-core.ts';
import { safeBridgeEmit } from './pi-bridge-core.ts';

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
    const short =
      c.length > LOG_PREVIEW_SNIPPET_MAX
        ? `${c.slice(0, LOG_PREVIEW_SNIPPET_HEAD_CHARS)}…`
        : c;
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

export type BridgeMaps = {
  toolStartMs: Map<string, number>;
  streamingToolByIndex: Map<number, StreamingToolAcc>;
};

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

export function handleTurnStart(ctx: PiSessionBridgeContext, maps: BridgeMaps): void {
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  ctx.modelTurnId.current += 1;
  safeBridgeEmit(ctx, { type: 'progress', payload: AGENTIC_PROGRESS_WORKING });
  ctx.waitingForFirstToken.current = true;
  safeBridgeEmit(
    ctx,
    ctx.trace('model_turn_start', RUN_TRACE_LABEL_AGENT_WORKING, {
      phase: 'building',
    }),
  );
  debugAgentIngest({
    hypothesisId: 'H1',
    location: 'pi-bridge-tool-streaming.ts:turn_start',
    message: 'model turn_start',
    data: {
      modelTurnId: ctx.modelTurnId.current,
      pendingToolCalls: toolStartMs.size,
    },
  });
  syncPendingToolProbe(ctx, toolStartMs);
}

export function handleMessageUpdate(
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
      const { toolName, toolPath } = toolMetaFromPartialNarrowed(msg.partial, idx);
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
        const meta = toolMetaFromPartialNarrowed(msg.partial, idx);
        const now = Date.now();
        acc = {
          toolName: meta.toolName,
          toolPath: meta.toolPath,
          streamedChars: 0,
          lastEmitAt: now,
        };
        streamingToolByIndex.set(idx, acc);
      }
      const pathFromPartial = extractToolPathFromAssistantPartial(msg.partial, idx);
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
      const tcNarrowed = parsePiToolCallEnd(msg.toolCall);
      const tc = tcNarrowed ?? {};
      const toolName =
        (typeof tc.name === 'string' && tc.name.length > 0 ? tc.name : acc?.toolName) ?? 'tool';
      const toolPath = toolPathFromNarrowedToolCall(tc) ?? acc?.toolPath;
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

export function handleToolExecutionStart(
  ctx: PiSessionBridgeContext,
  maps: BridgeMaps,
  event: AgentSessionEvent,
): void {
  if (event.type !== 'tool_execution_start') return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const tn = event.toolName;
  const rawArgs = parseUnknownArgsRecord(event.args);
  const command = typeof rawArgs?.command === 'string' ? rawArgs.command : undefined;
  const { path, pattern } = parsePiToolExecutionArgs(tn, event.args);
  const reusedToolCallId = toolStartMs.has(event.toolCallId);
  toolStartMs.set(event.toolCallId, Date.now());
  debugAgentIngest({
    hypothesisId: 'H2',
    location: 'pi-bridge-tool-streaming.ts:tool_execution_start',
    message: 'tool_execution_start',
    data: {
      toolCallId: event.toolCallId,
      toolName: tn,
      path,
      pattern,
      reusedToolCallId,
      commandPreview:
        command != null && command.length > LOG_COMMAND_PREVIEW_MAX
          ? `${command.slice(0, LOG_COMMAND_PREVIEW_HEAD_CHARS)}…`
          : command,
      pendingAfter: toolStartMs.size,
    },
  });
  syncPendingToolProbe(ctx, toolStartMs);
  ctx.toolPathByCallId.set(event.toolCallId, path);
  const toolArgs = serializePiToolArgsForTrace(rawArgs);
  ctx.toolArgsByCallId.set(event.toolCallId, toolArgs);
  safeBridgeEmit(
    ctx,
    ctx.trace('tool_started', path ? `${tn} → ${path}` : `Started ${tn}`, {
      phase: 'building',
      toolName: tn,
      path,
      ...(toolArgs != null ? { toolArgs } : {}),
    }),
  );
  safeBridgeEmit(ctx, {
    type: 'progress',
    payload: toolStartProgressPayload(tn, path, pattern, command),
  });
}

export function handleToolExecutionEnd(
  ctx: PiSessionBridgeContext,
  maps: BridgeMaps,
  event: AgentSessionEvent,
): void {
  if (event.type !== 'tool_execution_end') return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const started = toolStartMs.get(event.toolCallId);
  const durationMs = started != null ? Date.now() - started : undefined;
  toolStartMs.delete(event.toolCallId);
  debugAgentIngest({
    hypothesisId: started == null ? 'H3' : 'H2',
    location: 'pi-bridge-tool-streaming.ts:tool_execution_end',
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
  const resultText = serializePiToolResultForTrace(event.result, event.isError);
  const traceResultFields =
    resultText != null ? { detail: resultText, toolResult: resultText } : {};
  if (event.isError) {
    const path = ctx.toolPathByCallId.get(event.toolCallId);
    const failedArgs = ctx.toolArgsByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace('tool_failed', `Tool failed: ${event.toolName}`, {
        phase: 'building',
        toolName: event.toolName,
        path,
        status: 'error',
        ...traceResultFields,
        ...(failedArgs != null ? { toolArgs: failedArgs } : {}),
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
        ...traceResultFields,
      }),
    );
  }
  ctx.toolPathByCallId.delete(event.toolCallId);
  ctx.toolArgsByCallId.delete(event.toolCallId);
}
