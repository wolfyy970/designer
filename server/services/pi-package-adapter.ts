/**
 * Package-backed adapter for the new Pi boundary at `@auto-designer/pi`.
 *
 * Surfaces the same `runDesignAgentSession` signature as the legacy
 * `pi-agent-service.ts` so callers don't change. Internally it builds a
 * `SessionHandle` from the package, runs it, and translates package events to
 * the host's `AgentRunEvent` shape.
 *
 * **Status (Phase 4 scaffolding):** the dispatch wiring is in place but the
 * full event-fidelity translation hasn't been implemented yet. Flipping the
 * `PI_INTEGRATION` flag to `package` will surface a "not yet wired" error from
 * here so we never silently fall back to a half-built path. Implementation
 * lands in a follow-up turn.
 */
import type { AgentRunEvent, AgentSessionParams, DesignAgentSessionResult } from './agent-runtime.ts';

export async function runDesignAgentSessionViaPackage(
  _params: AgentSessionParams,
  _onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<DesignAgentSessionResult | null> {
  throw new Error(
    "PI_INTEGRATION=package was selected, but the package-backed adapter isn't wired yet. " +
      'Re-run with PI_INTEGRATION=legacy (or unset it) until the adapter lands.',
  );
}
