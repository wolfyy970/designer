import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { RunTraceEvent } from '../../src/types/provider.ts';
import { parsePiToolExecutionArgs } from '../lib/pi-tool-args.ts';
import { stripProviderControlTokens } from '../lib/stream-sanitize.ts';
import type { AgentRunEvent } from './pi-agent-service.ts';

export interface PiAgentSubscribeContext {
  onEvent: (event: AgentRunEvent) => void | Promise<void>;
  trace: (
    kind: RunTraceEvent['kind'],
    label: string,
    extra?: Partial<RunTraceEvent>,
  ) => AgentRunEvent;
  toolPathByCallId: Map<string, string | undefined>;
  /** Mutable: first token tracking for `message_update`. */
  waitingForFirstToken: { current: boolean };
}

function emitFirstTokenIfNeeded(ctx: PiAgentSubscribeContext): void {
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
  pattern: string | undefined,
): string {
  switch (toolName) {
    case 'write_file':
      return `Writing ${path ?? 'file'}…`;
    case 'edit_file':
      return `Editing ${path ?? 'file'}…`;
    case 'grep':
      return `Searching for "${pattern ?? ''}"…`;
    case 'validate_js':
    case 'validate_html':
      return `Validating ${path ?? 'file'}…`;
    case 'plan_files':
      return 'Recording optional file plan…';
    case 'read_file':
      return `Reading ${path ?? 'file'}…`;
    case 'ls':
      return 'Listing workspace…';
    case 'find': {
      const globPat = pattern ?? '';
      return globPat ? `Finding \`${globPat}\`…` : 'Finding paths…';
    }
    case 'todo_write':
      return 'Updating tasks…';
    default:
      return `Running ${toolName}…`;
  }
}

export function handlePiAgentSubscribeEvent(ctx: PiAgentSubscribeContext, event: AgentEvent): void {
  if (event.type === 'turn_start') {
    void ctx.onEvent({ type: 'progress', payload: 'Model turn…' });
    ctx.waitingForFirstToken.current = true;
    void ctx.onEvent(
      ctx.trace('model_turn_start', 'Model turn started', {
        phase: 'building',
      }),
    );
    return;
  }

  if (event.type === 'message_update') {
    const e = event.assistantMessageEvent;
    if (e.type === 'text_delta' && e.delta) {
      emitFirstTokenIfNeeded(ctx);
      const delta = stripProviderControlTokens(e.delta);
      if (delta) void ctx.onEvent({ type: 'activity', payload: delta });
    } else if (e.type === 'thinking_delta' && e.delta) {
      emitFirstTokenIfNeeded(ctx);
      const delta = stripProviderControlTokens(e.delta);
      if (delta) void ctx.onEvent({ type: 'activity', payload: delta });
    }
    return;
  }

  if (event.type === 'tool_execution_start') {
    const tn = event.toolName;
    const { path, pattern } = parsePiToolExecutionArgs(tn, event.args);
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
      payload: toolStartProgressPayload(tn, path, pattern),
    });
    return;
  }

  if (event.type === 'tool_execution_end') {
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
    if (!event.isError && event.toolName === 'write_file') {
      const text = event.result?.content?.[0]?.text;
      if (typeof text === 'string' && text.startsWith('File written:')) {
        void ctx.onEvent({
          type: 'progress',
          payload: text.endsWith('.') ? text.slice(0, -1) + ' ✓' : `${text} ✓`,
        });
      } else {
        void ctx.onEvent({ type: 'progress', payload: 'File saved ✓' });
      }
    }
  }
}
