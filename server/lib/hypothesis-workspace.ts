import { HYPOTHESIS_COMPILER_MODEL } from '../../src/constants/canvas.ts';
import type { CompiledPrompt } from '../../src/types/compiler.ts';
import type { EvaluationContextPayload } from '../../src/types/evaluation.ts';
import type { ProvenanceContext } from '../../src/types/provenance-context.ts';
import {
  buildHypothesisGenerationContextFromInputs,
  evaluationPayloadFromHypothesisContext,
  provenanceFromHypothesisContext,
  workspaceSnapshotWireToGraph,
  type HypothesisGenerationContext,
} from '../../src/workspace/hypothesis-generation-pure.ts';
import { compileHypothesisPrompts } from '../services/compiler.ts';
import { createResolvePromptBody, sanitizePromptOverrides } from './prompt-overrides.ts';
import { generateId, now } from '../../src/lib/utils.ts';

import { applyLockdownToHypothesisContext } from './lockdown-model.ts';
import type { HypothesisWorkspaceCoreInput } from './hypothesis-schemas.ts';

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
    defaultCompilerProvider: body.defaultCompilerProvider,
  });
  if (!ctxRaw) return null;
  const ctx = applyLockdownToHypothesisContext(ctxRaw);

  const resolvePrompt = createResolvePromptBody(sanitizePromptOverrides(body.promptOverrides));
  const hypothesisTemplate = await resolvePrompt('designer-hypothesis-inputs');
  const filteredPlan = {
    id: generateId(),
    specId: ctx.spec.id,
    dimensions: [],
    hypotheses: [ctx.hypothesisStrategy],
    generatedAt: now(),
    compilerModel: HYPOTHESIS_COMPILER_MODEL,
  };

  const prompts = compileHypothesisPrompts(
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
