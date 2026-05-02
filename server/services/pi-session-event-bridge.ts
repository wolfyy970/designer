/**
 * Bridge Pi `AgentSession` events → app `AgentRunEvent` SSE payloads.
 */
import type { AgentSessionEvent, AgentSession } from '@auto-designer/pi';
import type { PiSessionBridgeContext } from './pi-bridge-core.ts';
import {
  handleAgentEnd,
  handleCompactionEnd,
  handleCompactionStart,
} from './pi-bridge-compaction-agent.ts';
import {
  STREAMING_TOOL_EMIT_INTERVAL_MS,
  handleMessageUpdate,
  handleToolExecutionEnd,
  handleToolExecutionStart,
  handleTurnStart,
  type BridgeMaps,
} from './pi-bridge-tool-streaming.ts';

export type { PiSessionBridgeContext } from './pi-bridge-core.ts';
export { STREAMING_TOOL_EMIT_INTERVAL_MS };

/** Subscribe until `unsubscribe()`; call when the agent session is ready. */
export function subscribePiSessionBridge(session: AgentSession, ctx: PiSessionBridgeContext): () => void {
  const maps: BridgeMaps = {
    toolStartMs: new Map<string, number>(),
    streamingToolByIndex: new Map(),
  };
  if (ctx.pendingToolCallsRef) ctx.pendingToolCallsRef.current = maps.toolStartMs.size;
  return session.subscribe((event: AgentSessionEvent) => {
    switch (event.type) {
      case 'turn_start':
        handleTurnStart(ctx, maps);
        return;
      case 'message_update':
        handleMessageUpdate(ctx, maps, event);
        return;
      case 'tool_execution_start':
        handleToolExecutionStart(ctx, maps, event);
        return;
      case 'tool_execution_end':
        handleToolExecutionEnd(ctx, maps, event);
        return;
      case 'compaction_start':
        handleCompactionStart(ctx, event);
        return;
      case 'compaction_end':
        handleCompactionEnd(ctx, event);
        return;
      case 'agent_end':
        handleAgentEnd(ctx, event);
        return;
      case 'message_start':
      case 'message_end':
      case 'turn_end':
        return;
      default:
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[bridge] unhandled Pi event type:', (event as { type?: string }).type);
        }
    }
  });
}
