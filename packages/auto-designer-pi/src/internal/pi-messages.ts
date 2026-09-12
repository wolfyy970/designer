/**
 * Inspection of Pi's raw message array.
 *
 * The Pi SDK hands us `messages` as `unknown`. Two call sites need the most
 * recent assistant turn, and they need to agree on it:
 *
 *   - `event-bridge.ts` decides `agent_end.aborted` / `errorMessage`, which
 *     `host.ts` copies into `SessionRunResult` — i.e. how a finished run is
 *     labelled in the UI and in logs.
 *   - `host.ts`'s upstream-retry loop decides whether the run ended in a
 *     retryable error.
 *
 * They previously each carried their own copy of the backwards scan. That is
 * the "did this run fail?" predicate, written twice — so a new `stopReason`
 * added upstream could be honoured by one and missed by the other, producing a
 * run that is retried but reported clean, or reported failed but never retried.
 *
 * One implementation, deliberately permissive about shape: the array is
 * untyped, so every access is guarded rather than asserted.
 */

export interface LastAssistantMessage {
  stopReason?: string;
  errorMessage?: string;
}

/**
 * Scan backwards for the most recent assistant message.
 *
 * Backwards rather than "last element" because Pi appends a tool-result
 * message after an assistant turn that errored — checking only the final entry
 * would miss the failure entirely.
 *
 * Returns `undefined` for a non-array or an array with no assistant turn; both
 * mean "no failure to report", not "crashed".
 */
export function findLastAssistantMessage(messages: unknown): LastAssistantMessage | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === 'object' && (m as { role?: unknown }).role === 'assistant') {
      return m as LastAssistantMessage;
    }
  }
  return undefined;
}
