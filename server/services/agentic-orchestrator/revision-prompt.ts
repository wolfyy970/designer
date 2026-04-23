import type { EvaluationRoundSnapshot } from '../../../src/types/evaluation.ts';
import type { EvaluationContextPayload } from '../../../src/types/evaluation.ts';
import {
  buildEvaluatorTracesSection,
  buildRevisionUserContext,
  buildRoundHistorySection,
  type EvaluationRoundHistoryEntry,
} from '../../lib/agentic-revision-user.ts';

export interface BuildRevisionUserPromptArgs {
  /** The compiled designer prompt text (already pre-compiled by the server). */
  compiledPrompt: string;
  evaluationContext: EvaluationContextPayload | null | undefined;
  revisionUserInstructions: string;
  roundHistory: EvaluationRoundHistoryEntry[];
  snapshot: EvaluationRoundSnapshot;
}

/**
 * Assembles the multi-section revision user prompt that the designer sees
 * on every revision round. Extracted from `run.ts` so the layout is unit-
 * testable (section order, trace inclusion, fix ordering) without a Pi
 * session or LLM call.
 *
 * Section order (stable — tests depend on it):
 *   1. Base context (brief + prior user turn) — from `buildRevisionUserContext`
 *   2. `revisionUserInstructions` body (from the designer-agentic-revision-user skill)
 *   3. Round history — from `buildRoundHistorySection`
 *   4. `## Revision brief` + brief text
 *   5. (optional) `buildEvaluatorTracesSection` — only when non-empty
 *   6. `## Prioritized fixes` + numbered list from aggregate
 */
export function buildRevisionUserPrompt(args: BuildRevisionUserPromptArgs): string {
  const { compiledPrompt, evaluationContext, revisionUserInstructions, roundHistory, snapshot } =
    args;
  const tracesSection = buildEvaluatorTracesSection(snapshot.aggregate.evaluatorTraces);
  const parts: string[] = [
    buildRevisionUserContext(compiledPrompt, evaluationContext ?? undefined),
    revisionUserInstructions,
    '',
    buildRoundHistorySection(roundHistory),
    '## Revision brief',
    snapshot.aggregate.revisionBrief,
  ];
  if (tracesSection.length > 0) {
    parts.push('', tracesSection);
  }
  parts.push(
    '',
    '## Prioritized fixes',
    ...snapshot.aggregate.prioritizedFixes.map((f, i) => `${i + 1}. ${f}`),
  );
  return parts.join('\n');
}
