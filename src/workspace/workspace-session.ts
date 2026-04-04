/**
 * Readonly use-case contexts built from the workspace graph.
 * Alternate UIs can construct these DTOs without a node–edge editor.
 *
 * Pure logic lives in `hypothesis-generation-pure.ts` (server-importable).
 */
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import type { VariantStrategy } from '../types/compiler';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { ProvenanceContext } from '../types/provenance-context';
import type { DesignSpec } from '../types/spec';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import {
  buildHypothesisGenerationContextFromInputs,
  evaluationPayloadFromHypothesisContext as evaluationPayloadPure,
  provenanceFromHypothesisContext as provenancePure,
  type HypothesisGenerationContext,
  type WorkspaceGraphSnapshot,
} from './hypothesis-generation-pure';

export type { HypothesisGenerationContext };

export function buildHypothesisGenerationContext(input: {
  hypothesisNodeId: string;
  variantStrategy: VariantStrategy;
  snapshot: WorkspaceGraphSnapshot;
  spec: DesignSpec;
}): HypothesisGenerationContext | null {
  const s = useWorkspaceDomainStore.getState();
  const domainHyp = s.hypotheses[input.hypothesisNodeId];
  return buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: input.hypothesisNodeId,
    variantStrategy: input.variantStrategy,
    spec: input.spec,
    snapshot: input.snapshot,
    domainHypothesis: domainHyp ?? null,
    modelProfiles: s.modelProfiles,
    designSystems: s.designSystems,
    defaultCompilerProvider: DEFAULT_COMPILER_PROVIDER,
  });
}

export function provenanceFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): ProvenanceContext {
  return provenancePure(ctx);
}

export function evaluationPayloadFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): EvaluationContextPayload | undefined {
  return evaluationPayloadPure(ctx);
}
