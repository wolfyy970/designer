import type { AgenticStopReason } from '../../../src/types/evaluation.ts';

/**
 * Pure decision table for the terminal stop reason of the revision loop.
 * Extracted from `run.ts` so the priority (abort > satisfied > max_revisions)
 * is testable without booting a Pi session.
 *
 *   - `aborted` wins over any other signal — the client is gone or the user cancelled.
 *   - `satisfied` means `isEvalSatisfied(...)` returned true on the latest snapshot.
 *   - Otherwise we exhausted the revision budget → `max_revisions`.
 *
 * Callers that explicitly know a revision round itself failed pass
 * `reason: 'revision_failed'` directly; this helper does not infer that state.
 */
export function decideStopReason(args: {
  aborted: boolean;
  satisfied: boolean;
}): AgenticStopReason {
  if (args.aborted) return 'aborted';
  if (args.satisfied) return 'satisfied';
  return 'max_revisions';
}
