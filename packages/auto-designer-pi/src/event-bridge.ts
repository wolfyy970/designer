/**
 * Narrow event vocabulary the package emits to its host. The legacy host bridge
 * (`pi-session-event-bridge.ts`) reshapes Pi events into a much wider AgentRunEvent
 * union for SSE; that translation belongs in the host because it owns the wire
 * shape and the dev `/api/logs` ring. The package only surfaces event types whose
 * meaning is universal across hosts.
 *
 * File events come from VFS-tool callbacks (write/edit/bash) — they don't go
 * through this bridge. Same for `todos` (todo_write tool callback). The bridge
 * adds compaction lifecycle, tool-execution timing, and agent-end status.
 */
import type { AgentSession, AgentSessionEvent } from './internal/pi-types.ts';

export type SessionEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; aborted: boolean; errorMessage?: string }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; durationMs: number }
  | { type: 'compaction_start'; reason: string }
  | {
      type: 'compaction_end';
      reason: string;
      aborted: boolean;
      willRetry: boolean;
      errorMessage?: string;
      summaryChars?: number;
    };

export interface SubscribeOptions {
  onEvent: (event: SessionEvent) => void | Promise<void>;
}

interface AgentEndLike {
  type: 'agent_end';
  messages?: unknown;
}

function lastAssistant(messages: unknown): { stopReason?: string; errorMessage?: string } | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === 'object' && (m as { role?: unknown }).role === 'assistant') {
      return m as { stopReason?: string; errorMessage?: string };
    }
  }
  return undefined;
}

/**
 * Subscribe a SessionHandle's host to the narrow event vocabulary.
 * Returns the unsubscribe function from `AgentSession.subscribe`.
 */
export function subscribeNarrowBridge(session: AgentSession, opts: SubscribeOptions): () => void {
  const toolStartMs = new Map<string, number>();
  return session.subscribe((event: AgentSessionEvent) => {
    switch (event.type) {
      case 'turn_start':
        return void opts.onEvent({ type: 'turn_start' });
      case 'turn_end':
        return void opts.onEvent({ type: 'turn_end' });
      case 'tool_execution_start': {
        const e = event as { type: 'tool_execution_start'; toolCallId: string; toolName: string };
        toolStartMs.set(e.toolCallId, Date.now());
        return void opts.onEvent({
          type: 'tool_execution_start',
          toolCallId: e.toolCallId,
          toolName: e.toolName,
        });
      }
      case 'tool_execution_end': {
        const e = event as { type: 'tool_execution_end'; toolCallId: string; toolName: string };
        const start = toolStartMs.get(e.toolCallId);
        toolStartMs.delete(e.toolCallId);
        return void opts.onEvent({
          type: 'tool_execution_end',
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          durationMs: start ? Date.now() - start : 0,
        });
      }
      case 'compaction_start': {
        const e = event as { type: 'compaction_start'; reason: string };
        return void opts.onEvent({ type: 'compaction_start', reason: e.reason });
      }
      case 'compaction_end': {
        const e = event as {
          type: 'compaction_end';
          reason: string;
          aborted: boolean;
          willRetry: boolean;
          errorMessage?: string;
          result?: { summary: string };
        };
        return void opts.onEvent({
          type: 'compaction_end',
          reason: e.reason,
          aborted: e.aborted,
          willRetry: e.willRetry,
          errorMessage: e.errorMessage,
          summaryChars: e.result?.summary.length,
        });
      }
      case 'agent_end': {
        const e = event as AgentEndLike;
        const last = lastAssistant(e.messages);
        const aborted = last?.stopReason === 'aborted';
        const errorMessage = last?.stopReason === 'error' ? last?.errorMessage : undefined;
        return void opts.onEvent({ type: 'agent_end', aborted, errorMessage });
      }
      default:
        return;
    }
  });
}
