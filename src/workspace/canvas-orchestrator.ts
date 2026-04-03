import { GENERATION_STATUS } from '../constants/generation';
import { allVariantStrategyIds } from '../stores/compiler-store';
import type { DimensionMap } from '../types/compiler';
import type { GenerationResult } from '../types/provider';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { getHypothesisRefId, isPlaceholderHypothesis } from '../lib/hypothesis-node-utils';

/**
 * Hypothesis/variant nodes whose backing compiler or generation state is gone
 * (or stale placeholders when not compiling).
 */
export function collectOrphanNodeIds(
  nodes: WorkspaceNode[],
  dimensionMaps: Record<string, DimensionMap>,
  results: GenerationResult[],
  isCompiling: boolean,
): Set<string> {
  const validStrategyIds = allVariantStrategyIds(dimensionMaps);
  const resultVsIds = new Set(results.map((r) => r.variantStrategyId));
  const orphanIds = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'hypothesis' && isPlaceholderHypothesis(node.data) && !isCompiling) {
      orphanIds.add(node.id);
      continue;
    }
    const refId = getHypothesisRefId(node);
    if (node.type === 'hypothesis' && refId && !validStrategyIds.has(refId)) {
      orphanIds.add(node.id);
    }
    if (
      node.type === 'variant' &&
      !node.data.pinnedRunId &&
      node.data.variantStrategyId &&
      !resultVsIds.has(node.data.variantStrategyId as string)
    ) {
      orphanIds.add(node.id);
    }
  }
  return orphanIds;
}

/** Drop dimension-map variant rows with no linked non-placeholder hypothesis card. */
export function pruneDimensionMapsToLinkedRefIds(
  nodes: WorkspaceNode[],
  dimensionMaps: Record<string, DimensionMap>,
): { nextMaps: Record<string, DimensionMap>; changed: boolean } {
  const linkedRefIds = new Set(
    nodes
      .filter((n) => n.type === 'hypothesis' && !isPlaceholderHypothesis(n.data))
      .map((n) => getHypothesisRefId(n))
      .filter((rid): rid is string => Boolean(rid)),
  );
  let changed = false;
  const nextMaps = { ...dimensionMaps };
  for (const [incId, map] of Object.entries(dimensionMaps)) {
    const nextVariants = map.variants.filter((v) => linkedRefIds.has(v.id));
    if (nextVariants.length !== map.variants.length) {
      nextMaps[incId] = { ...map, variants: nextVariants };
      changed = true;
    }
  }
  return { nextMaps, changed };
}

/** Result ids stuck in "generating" after reload (caller should patch to error when not generating). */
export function staleGeneratingResultIds(
  results: GenerationResult[],
  isGenerating: boolean,
): string[] {
  if (isGenerating) return [];
  return results.filter((r) => r.status === GENERATION_STATUS.GENERATING).map((r) => r.id);
}

export function applyOrphanRemovalToGraph(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[],
  orphanIds: Set<string>,
): { nodes: WorkspaceNode[]; edges: WorkspaceEdge[] } {
  return {
    nodes: nodes.filter((n) => !orphanIds.has(n.id)),
    edges: edges.filter((e) => !orphanIds.has(e.source) && !orphanIds.has(e.target)),
  };
}
