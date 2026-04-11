import { HYPOTHESIS_INCUBATOR_MODEL } from '../../src/constants/canvas.ts';
import type { CompiledPrompt } from '../../src/types/incubator.ts';
import type { EvaluationContextPayload } from '../../src/types/evaluation.ts';
import type { ProvenanceContext } from '../../src/types/provenance-context.ts';
import {
  buildHypothesisGenerationContextFromInputs,
  evaluationPayloadFromHypothesisContext,
  provenanceFromHypothesisContext,
  workspaceSnapshotWireToGraph,
  type HypothesisGenerationContext,
} from '../../src/workspace/hypothesis-generation-pure.ts';
import { incubateHypothesisPrompts } from './incubator.ts';
import { getPromptBody } from '../lib/prompt-resolution.ts';
import { generateId, now } from '../../src/lib/utils.ts';

import { applyLockdownToHypothesisContext } from '../lib/lockdown-model.ts';
import type { HypothesisWorkspaceCoreInput } from '../lib/hypothesis-schemas.ts';

export interface HypothesisWorkspaceBundle {
  readonly ctx: HypothesisGenerationContext;
  readonly prompts: CompiledPrompt[];
  readonly evaluationContext: EvaluationContextPayload | undefined;
  readonly provenance: ProvenanceContext;
}

/**
 * Shared prompt assembly for POST /hypothesis/prompt-bundle and /hypothesis/generate.
 */
export async function buildHypothesisWorkspaceBundle(
  body: HypothesisWorkspaceCoreInput,
): Promise<HypothesisWorkspaceBundle | null> {
  const ctxRaw = buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: body.hypothesisNodeId,
    hypothesisStrategy: body.strategy,
    spec: body.spec,
    snapshot: workspaceSnapshotWireToGraph(body.snapshot),
    domainHypothesis: body.domainHypothesis ?? undefined,
    modelProfiles: body.modelProfiles,
    designSystems: body.designSystems,
    defaultIncubatorProvider: body.defaultIncubatorProvider,
  });
  if (!ctxRaw) return null;
  const ctx = applyLockdownToHypothesisContext(ctxRaw);

  const hypothesisTemplate = await getPromptBody('designer-hypothesis-inputs');
  const filteredPlan = {
    id: generateId(),
    specId: ctx.spec.id,
    dimensions: [],
    hypotheses: [ctx.hypothesisStrategy],
    generatedAt: now(),
    incubatorModel: HYPOTHESIS_INCUBATOR_MODEL,
  };

  const prompts = incubateHypothesisPrompts(
    ctx.spec,
    filteredPlan,
    hypothesisTemplate,
    ctx.designSystemContent,
    [...ctx.designSystemImages],
  );
  const evaluationContext = evaluationPayloadFromHypothesisContext(ctx);
  const provenance = provenanceFromHypothesisContext(ctx);
  return { ctx, prompts, evaluationContext, provenance };
}
