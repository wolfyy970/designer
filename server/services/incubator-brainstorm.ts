/**
 * Optional brainstorm-and-curate prelude before the incubator stage.
 *
 * Promoted from the experiments tool's `ideation` flow after a 384-cell
 * matrix showed a brainstorm-and-curate step before the incubator
 * produced ~15% more distinct themes across reps on open-ended briefs
 * (themeClusterRatio 0.84 vs canonical's 0.73). Cost: ~50% more wall
 * time on the incubator step.
 *
 * Runs two LLM calls in sequence:
 *   1. Brainstorm — 10-15 categorically different product directions
 *      from the design brief, explicitly anti-censorship.
 *   2. Curation — pick exactly 5 for maximum spread across the
 *      solution space (not maximum plausibility).
 *
 * The 5 curated directions are stitched into the design-brief content
 * as a `<product_shape_candidates>` block so they propagate through the
 * rest of the incubation request via `buildInternalContext(spec)`.
 *
 * Currently runs OUT OF BAND of the route's SSE stream. The user sees
 * no progress for the ~30-90s the prelude takes. The brainstorm toggle
 * in `IncubatorNode.tsx` carries an explicit "~50% slower" warning so
 * this is a known trade-off, not a surprise. A future iteration may
 * promote the prelude into the SSE stream so `TaskStreamMonitor` shows
 * per-stage progress; not needed for v1.
 */
import { randomUUID } from 'node:crypto';
import { getPromptBody } from '../lib/prompt-resolution.ts';
import { runTaskAgentPiSession } from './task-agent-session.ts';
import { resolveTaskAgentResultFile } from './task-agent-result-files.ts';

export interface BrainstormPreludeInput {
  designBrief: string;
  providerId: string;
  modelId: string;
  signal?: AbortSignal;
  correlationId: string;
}

export interface BrainstormPreludeResult {
  /** The augmented design brief that should replace the original brief sent to the incubator. */
  augmentedBrief: string;
  /** Raw curation output for logging / debugging. */
  curatedText: string;
}

/**
 * Runs the brainstorm → curation → stitch sequence. The returned
 * `augmentedBrief` is the original brief plus a
 * `<product_shape_candidates>` block containing the 5 curated
 * directions. Throws on any sub-stage failure; the caller surfaces the
 * error through the incubate route's normal error path.
 */
export async function runBrainstormPrelude(
  input: BrainstormPreludeInput,
): Promise<BrainstormPreludeResult> {
  const trimmedBrief = input.designBrief.trim();
  if (!trimmedBrief) {
    throw new Error('Brainstorm prelude requires a non-empty design brief.');
  }

  // ── Stage A: Brainstorm ──────────────────────────────────────────────
  const brainstormGuidance = await getPromptBody('incubator-brainstorm-system');
  const brainstormPrompt = `${brainstormGuidance}

<brief>
${trimmedBrief}
</brief>`;

  const brainstormSession = await runTaskAgentPiSession(
    {
      userPrompt: brainstormPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      sessionType: 'inputs-gen',
      signal: input.signal,
      correlationId: input.correlationId,
      initialProgressMessage: 'Brainstorming directions…',
    },
    async () => {},
  );
  if (!brainstormSession.sessionResult) {
    throw new Error('Brainstorm prelude returned no session result.');
  }
  const brainstormResolved = resolveTaskAgentResultFile({
    files: brainstormSession.sessionResult.files,
    resultFile: 'result.md',
    fallback: 'firstNonEmptyFile',
  });
  if (!brainstormResolved || !brainstormResolved.result.trim()) {
    throw new Error('Brainstorm prelude returned no result.');
  }
  const brainstormText = brainstormResolved.result.trim();

  // ── Stage B: Curation ────────────────────────────────────────────────
  const curationGuidance = await getPromptBody('incubator-curation-system');
  const curationPrompt = `${curationGuidance}

<brainstorm_directions>
${brainstormText}
</brainstorm_directions>`;

  const curationSession = await runTaskAgentPiSession(
    {
      userPrompt: curationPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      sessionType: 'inputs-gen',
      signal: input.signal,
      correlationId: randomUUID(),
      initialProgressMessage: 'Curating top 5…',
    },
    async () => {},
  );
  if (!curationSession.sessionResult) {
    throw new Error('Curation prelude returned no session result.');
  }
  const curationResolved = resolveTaskAgentResultFile({
    files: curationSession.sessionResult.files,
    resultFile: 'result.md',
    fallback: 'firstNonEmptyFile',
  });
  if (!curationResolved || !curationResolved.result.trim()) {
    throw new Error('Curation prelude returned no result.');
  }
  const curatedText = curationResolved.result.trim();

  // ── Stage C: Stitch curated 5 into the brief ────────────────────────
  // Mirrors `experiments/src/flows/ideation.ts:68-72` — the
  // `<product_shape_candidates>` block becomes part of the brief so it
  // propagates through `buildInternalContext(spec)` and the incubator's
  // anchor instructions ("Anchor everything in the design specification
  // supplied by the user message: Design Brief, …, existing
  // hypotheses").
  const augmentedBrief = `${trimmedBrief}

<product_shape_candidates>
${curatedText}
</product_shape_candidates>`;

  return { augmentedBrief, curatedText };
}
