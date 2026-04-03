/**
 * Bridge Pi `AgentSession` events → app `AgentRunEvent` SSE payloads.
 */
import type { AgentSessionEvent, AgentSession } from './pi-sdk/types.ts';
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

function emitFirstTokenIfNeeded(ctx: PiSessionBridgeContext): void {
  if (ctx.waitingForFirstToken.current) {
    ctx.waitingForFirstToken.current = false;
    void ctx.onEvent(
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

/** Subscribe until `unsubscribe()`; call when the agent session is ready. */
export function subscribePiSessionBridge(session: AgentSession, ctx: PiSessionBridgeContext): () => void {
  const toolStartMs = new Map<string, number>();
  syncPendingToolProbe(ctx, toolStartMs);
  return session.subscribe((event: AgentSessionEvent) => {
    if (event.type === 'turn_start') {
      bumpStreamActivity(ctx);
      ctx.modelTurnId.current += 1;
      void ctx.onEvent({ type: 'progress', payload: 'Model turn…' });
      ctx.waitingForFirstToken.current = true;
      void ctx.onEvent(
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
      return;
    }

    if (event.type === 'message_update') {
      const e = event.assistantMessageEvent;
      if (e.type === 'text_delta' && e.delta) {
        emitFirstTokenIfNeeded(ctx);
        const delta = stripProviderControlTokens(e.delta);
        if (delta) {
          bumpStreamActivity(ctx);
          const logId = ctx.turnLogRef.current;
          if (logId) appendLlmCallResponse(logId, delta);
          void ctx.onEvent({ type: 'activity', payload: delta });
        }
      } else if (e.type === 'thinking_delta' && e.delta) {
        emitFirstTokenIfNeeded(ctx);
        const delta = stripProviderControlTokens(e.delta);
        if (delta) {
          bumpStreamActivity(ctx);
          const logId = ctx.turnLogRef.current;
          if (logId) appendLlmCallResponse(logId, delta);
          void ctx.onEvent({
            type: 'thinking',
            payload: delta,
            turnId: ctx.modelTurnId.current,
          });
        }
      }
      return;
    }

    if (event.type === 'tool_execution_start') {
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
          commandPreview:
            command != null && command.length > 160 ? `${command.slice(0, 157)}…` : command,
          pendingAfter: toolStartMs.size,
        },
      });
      syncPendingToolProbe(ctx, toolStartMs);
      ctx.toolPathByCallId.set(event.toolCallId, path);
      void ctx.onEvent(
        ctx.trace('tool_started', path ? `${tn} → ${path}` : `Started ${tn}`, {
          phase: 'building',
          toolName: tn,
          path,
        }),
      );
      void ctx.onEvent({
        type: 'progress',
        payload: toolStartProgressPayload(tn, path, pattern, command),
      });
      return;
    }

    if (event.type === 'tool_execution_end') {
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
        void ctx.onEvent(
          ctx.trace('tool_failed', `Tool failed: ${event.toolName}`, {
            phase: 'building',
            toolName: event.toolName,
            path,
            status: 'error',
          }),
        );
        void ctx.onEvent({
          type: 'progress',
          payload: `Tool failed: ${event.toolName}`,
        });
      } else {
        const path = ctx.toolPathByCallId.get(event.toolCallId);
        void ctx.onEvent(
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

    if (event.type === 'compaction_start') {
      void ctx.onEvent({ type: 'progress', payload: 'Compacting context…' });
      void ctx.onEvent(
        ctx.trace('compaction', 'Compacting context window', {
          phase: 'building',
        }),
      );
    }
  });
}
