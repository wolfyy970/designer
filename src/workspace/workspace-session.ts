/**
 * Readonly use-case contexts built from the workspace graph.
 * Alternate UIs can construct these DTOs without a node–edge editor.
 *
 * Lives under `src/workspace/` (not `src/types/`) so `tsconfig.server.json` does not
 * pull client-only modules like `lib/constants.ts` (Vite `import.meta.env`) into the server program.
 */
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import { collectDesignSystemInputs } from '../lib/canvas-graph';
import type { VariantStrategy } from '../types/compiler';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { ProvenanceContext } from '../types/provenance-context';
import type { DesignSpec, ReferenceImage } from '../types/spec';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import {
  listIncomingModelCredentials,
  nodeById,
  type ModelCredential,
  type WorkspaceGraphSnapshot,
} from './graph-queries';

export type { ModelCredential, WorkspaceGraphSnapshot };

export interface HypothesisGenerationContext {
  readonly hypothesisNodeId: string;
  readonly variantStrategy: VariantStrategy;
  readonly spec: DesignSpec;
  readonly agentMode: 'single' | 'agentic';
  readonly thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | undefined;
  readonly modelCredentials: readonly ModelCredential[];
  readonly designSystemContent: string | undefined;
  readonly designSystemImages: readonly ReferenceImage[];
}

function listModelCredentialsFromDomain(hypothesisNodeId: string): ModelCredential[] {
  const s = useWorkspaceDomainStore.getState();
  const h = s.hypotheses[hypothesisNodeId];
  if (!h) return [];
  const out: ModelCredential[] = [];
  for (const mid of h.modelNodeIds) {
    const p = s.modelProfiles[mid];
    if (!p?.modelId) continue;
    out.push({
      providerId: p.providerId || DEFAULT_COMPILER_PROVIDER,
      modelId: p.modelId,
    });
  }
  return out;
}

function collectDesignSystemPayloadFromDomain(hypothesisNodeId: string): DesignSystemInputsShape {
  const s = useWorkspaceDomainStore.getState();
  const h = s.hypotheses[hypothesisNodeId];
  if (!h) return { content: undefined, images: [] };
  const parts: string[] = [];
  const images: ReferenceImage[] = [];
  for (const dsId of h.designSystemNodeIds) {
    const ds = s.designSystems[dsId];
    if (!ds) continue;
    const c = ds.content || '';
    const t = ds.title || 'Design System';
    if (c.trim()) parts.push(`## ${t}\n${c}`);
    images.push(...(ds.images ?? []));
  }
  return {
    content: parts.join('\n\n---\n\n') || undefined,
    images,
  };
}

type DesignSystemInputsShape = {
  content: string | undefined;
  images: ReferenceImage[];
};

export function buildHypothesisGenerationContext(input: {
  hypothesisNodeId: string;
  variantStrategy: VariantStrategy;
  snapshot: WorkspaceGraphSnapshot;
  spec: DesignSpec;
}): HypothesisGenerationContext | null {
  const domainHyp = useWorkspaceDomainStore.getState().hypotheses[input.hypothesisNodeId];

  let modelCredentials = listModelCredentialsFromDomain(input.hypothesisNodeId);
  if (modelCredentials.length === 0) {
    modelCredentials = listIncomingModelCredentials(input.hypothesisNodeId, input.snapshot);
  }
  if (modelCredentials.length === 0) return null;

  const node = nodeById(input.snapshot, input.hypothesisNodeId);
  const agentMode =
    domainHyp?.agentMode ??
    ((node?.data?.agentMode as 'single' | 'agentic' | undefined) ?? 'single');
  const thinkingLevel =
    domainHyp?.thinkingLevel ??
    (node?.data?.thinkingLevel as
      | 'off'
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high'
      | undefined);

  let designSystemContent: string | undefined;
  let designSystemImages: readonly ReferenceImage[] = [];
  if (domainHyp && domainHyp.designSystemNodeIds.length > 0) {
    const ds = collectDesignSystemPayloadFromDomain(input.hypothesisNodeId);
    designSystemContent = ds.content;
    designSystemImages = ds.images;
  } else {
    const g = collectDesignSystemInputs(
      [...input.snapshot.nodes],
      [...input.snapshot.edges],
      input.hypothesisNodeId,
    );
    designSystemContent = g.content;
    designSystemImages = g.images;
  }

  return {
    hypothesisNodeId: input.hypothesisNodeId,
    variantStrategy: input.variantStrategy,
    spec: input.spec,
    agentMode,
    thinkingLevel,
    modelCredentials,
    designSystemContent,
    designSystemImages,
  };
}

export function provenanceFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): ProvenanceContext {
  const s = ctx.variantStrategy;
  return {
    strategies: {
      [s.id]: {
        name: s.name,
        hypothesis: s.hypothesis,
        rationale: s.rationale,
        dimensionValues: s.dimensionValues,
      },
    },
    designSystemSnapshot: ctx.designSystemContent || undefined,
  };
}

export function evaluationPayloadFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): EvaluationContextPayload | undefined {
  if (ctx.agentMode !== 'agentic') return undefined;
  const s = ctx.variantStrategy;
  return {
    strategyName: s.name,
    hypothesis: s.hypothesis,
    rationale: s.rationale,
    measurements: s.measurements,
    dimensionValues: s.dimensionValues,
    objectivesMetrics: ctx.spec.sections['objectives-metrics']?.content,
    designConstraints: ctx.spec.sections['design-constraints']?.content,
    designSystemSnapshot: ctx.designSystemContent || undefined,
  };
}
