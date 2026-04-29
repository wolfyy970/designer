/**
 * Pi prompt execution with app-level upstream retries (Friendli/OpenRouter gaps).
 */
import type { RunTraceEvent } from '../../src/types/provider.ts';
import { isAppRetryableUpstreamError, sleepMs } from '../lib/upstream-retry.ts';
import type { AgentSession } from './pi-sdk/types.ts';
import { findLastAssistantMessage } from '../lib/pi-message-helpers.ts';
import type { AgentRunEvent } from './agent-runtime.ts';

/** Manual retries after upstream errors the Pi SDK regex does not classify as retryable. */
export const MAX_APP_UPSTREAM_RETRIES = 2;

/**
 * Runs the initial prompt, then optional `continue()` rounds for upstream errors
 * (Friendli/OpenRouter) that Pi auto-retry does not match.
 */
export async function runPromptWithUpstreamRetries(
  session: AgentSession,
  userPrompt: string,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
  trace: (
    kind: RunTraceEvent['kind'],
    label: string,
    extra?: Partial<RunTraceEvent>,
  ) => AgentRunEvent,
): Promise<void> {
  await session.prompt(userPrompt, { expandPromptTemplates: false });

  let attempts = 0;
  while (attempts < MAX_APP_UPSTREAM_RETRIES) {
    const lastAssistant = findLastAssistantMessage(session.agent.state.messages);
    if (!lastAssistant || lastAssistant.stopReason !== 'error') return;
    if (!isAppRetryableUpstreamError(lastAssistant.errorMessage)) return;
    if (session.retryAttempt !== 0) return;

    attempts += 1;
    await onEvent({
      type: 'progress',
      payload: `Retrying after upstream error (attempt ${attempts}/${MAX_APP_UPSTREAM_RETRIES})…`,
    });
    await onEvent(
      trace('compaction', `Retrying after upstream error (${attempts}/${MAX_APP_UPSTREAM_RETRIES})`, {
        phase: 'building',
        status: 'warning',
        detail: lastAssistant.errorMessage?.slice(0, 500),
      }),
    );

    const msgs = session.agent.state.messages;
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      session.agent.replaceMessages(msgs.slice(0, -1));
    }
    await sleepMs(2000 * 2 ** (attempts - 1));
    await session.agent.continue();
  }
}
