/**
 * Pi bridge: compaction lifecycle + agent_end error surfacing.
 */
import type { AgentSessionEvent } from './pi-sdk/types.ts';
import { parseCompactionDetails } from '../lib/pi-bridge-narrowing.ts';
import { findLastAssistantMessage } from '../lib/pi-message-helpers.ts';
import type { RunTraceEvent } from '../../src/types/provider.ts';
import type { PiSessionBridgeContext } from './pi-bridge-core.ts';
import { safeBridgeEmit } from './pi-bridge-core.ts';

export function handleCompactionStart(
  ctx: PiSessionBridgeContext,
  event: Extract<AgentSessionEvent, { type: 'compaction_start' }>,
): void {
  const reasonLabel =
    event.reason === 'overflow'
      ? 'overflow recovery'
      : event.reason === 'threshold'
        ? 'threshold'
        : 'manual';
  safeBridgeEmit(ctx, { type: 'progress', payload: `Compacting context (${reasonLabel})…` });
  safeBridgeEmit(
    ctx,
    ctx.trace('compaction', 'Compacting context window', {
      phase: 'building',
      detail: `reason=${event.reason}`,
    }),
  );
}

/** Surface Pi agent termination with stopReason=error (upstream LLM failure) to SSE + Monitor trace. */
export function handleAgentEnd(ctx: PiSessionBridgeContext, event: AgentSessionEvent): void {
  if (event.type !== 'agent_end') return;
  const messages = (event as { type: 'agent_end'; messages: unknown[] }).messages;
  const lastAssistant = findLastAssistantMessage(messages);
  if (!lastAssistant || lastAssistant.stopReason !== 'error') return;
  const errMsg = lastAssistant.errorMessage?.trim() || 'Model stream error';
  const traceRow: RunTraceEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'tool_failed',
    label: 'Agent ended with model error',
    phase: 'building',
    status: 'error',
    detail: errMsg.slice(0, 512),
  };
  safeBridgeEmit(ctx, { type: 'trace', trace: traceRow });
  safeBridgeEmit(ctx, { type: 'error', payload: errMsg });
}

export function handleCompactionEnd(
  ctx: PiSessionBridgeContext,
  event: Extract<AgentSessionEvent, { type: 'compaction_end' }>,
): void {
  const result = event.result;
  const detailBits: string[] = [`reason=${event.reason}`];
  if (event.aborted) detailBits.push('aborted');
  if (event.willRetry) detailBits.push('willRetry');
  if (event.errorMessage) detailBits.push(`error=${event.errorMessage}`);
  if (result) {
    detailBits.push(`tokensBefore=${result.tokensBefore}`);
    detailBits.push(`summaryChars=${result.summary.length}`);
    const d = parseCompactionDetails(result.details);
    if (d?.modifiedFiles?.length) detailBits.push(`modifiedFiles=${d.modifiedFiles.length}`);
    if (d?.readFiles?.length) detailBits.push(`readFiles=${d.readFiles.length}`);
  }
  const rehydrationHint =
    'Rehydrate: use_skill for needed sandbox guides; use last todo_write / checkpoint lists; re-read key HTML/CSS/JS you were editing; grep if uncertain.';
  safeBridgeEmit(
    ctx,
    ctx.trace(
      'compaction',
      event.aborted
        ? 'Context compaction aborted'
        : event.errorMessage
          ? 'Context compaction finished with warning'
          : 'Context compaction finished',
      {
        phase: 'building',
        status: event.errorMessage ? 'warning' : event.aborted ? 'warning' : 'success',
        detail: `${detailBits.join('; ')} — ${rehydrationHint}`,
      },
    ),
  );
}
