/**
 * Shared Pi session message helpers (pi-agent-service + pi-session-event-bridge).
 */
import type { AgentSession, AssistantMessage } from '@auto-designer/pi';

/**
 * Last assistant message in the conversation, or undefined.
 * Accepts `unknown[]` for bridge events; narrows to `AssistantMessage` when role matches.
 */
export function findLastAssistantMessage(messages: readonly unknown[]): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      const role = (m as { role?: unknown }).role;
      if (role === 'assistant') return m as AssistantMessage;
    }
  }
  return undefined;
}

export function lastAssistantHasAgentError(session: AgentSession): boolean {
  return findLastAssistantMessage(session.agent.state.messages)?.stopReason === 'error';
}
