/**
 * Shared context + safe SSE emission for Pi session bridge modules.
 */
import { emitEvent } from './pi-sdk/index.ts';
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
  toolArgsByCallId: Map<string, string | undefined>;
  waitingForFirstToken: { current: boolean };
  turnLogRef: { current?: string };
  streamActivityAt: { current: number };
  modelTurnId: { current: number };
  /** Mirror of in-flight Pi tool calls (for stall diagnostics). */
  pendingToolCallsRef?: { current: number };
  /**
   * When SSE / stream delivery fails, abort the agent so we do not keep burning tokens
   * after the client can no longer receive events.
   */
  onStreamDeliveryFailure?: (err: unknown) => void;
}

/**
 * Fire-and-forget async `onEvent` without unhandled rejections (e.g. SSE write failures).
 * Delegates to `emitEvent` so the emission protocol is unified across the Pi boundary.
 */
export function safeBridgeEmit(ctx: PiSessionBridgeContext, event: AgentRunEvent): void {
  emitEvent(ctx.onEvent, event, {
    label: '[bridge]',
    onFail: ctx.onStreamDeliveryFailure,
  });
}
