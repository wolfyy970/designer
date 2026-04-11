import { NODE_TYPES } from '../constants/canvas';
import { GENERATION_STATUS } from '../constants/generation';
import { allStrategyIds } from '../stores/incubator-store';
import type { IncubationPlan } from '../types/incubator';
import type { GenerationResult } from '../types/provider';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { getHypothesisRefId, isPlaceholderHypothesis } from '../lib/hypothesis-node-utils';

/**
 * Hypothesis/preview nodes whose backing incubator or generation state is gone
 * (or stale placeholders when not incubating).
 */
export function collectOrphanNodeIds(
  nodes: WorkspaceNode[],
  incubationPlans: Record<string, IncubationPlan>,
  results: GenerationResult[],
  isCompiling: boolean,
): Set<string> {
  const validStrategyIds = allStrategyIds(incubationPlans);
  const resultVsIds = new Set(results.map((r) => r.strategyId));
  const orphanIds = new Set<string>();
  for (const node of nodes) {
    if (node.type === NODE_TYPES.HYPOTHESIS && isPlaceholderHypothesis(node.data) && !isCompiling) {
      orphanIds.add(node.id);
      continue;
    }
    const refId = getHypothesisRefId(node);
    if (node.type === NODE_TYPES.HYPOTHESIS && refId && !validStrategyIds.has(refId)) {
      orphanIds.add(node.id);
    }
    if (
      node.type === NODE_TYPES.PREVIEW &&
      !node.data.pinnedRunId &&
      node.data.strategyId &&
      !resultVsIds.has(node.data.strategyId as string)
    ) {
      orphanIds.add(node.id);
    }
  }
  return orphanIds;
}

/** Drop incubator-plan strategy rows with no linked non-placeholder hypothesis card. */
export function pruneIncubationPlansToLinkedRefIds(
  nodes: WorkspaceNode[],
  incubationPlans: Record<string, IncubationPlan>,
): { nextMaps: Record<string, IncubationPlan>; changed: boolean } {
  const linkedRefIds = new Set(
    nodes
      .filter((n) => n.type === NODE_TYPES.HYPOTHESIS && !isPlaceholderHypothesis(n.data))
      .map((n) => getHypothesisRefId(n))
      .filter((rid): rid is string => Boolean(rid)),
  );
  let changed = false;
  const nextMaps = { ...incubationPlans };
  for (const [incId, map] of Object.entries(incubationPlans)) {
    const nextHypotheses = map.hypotheses.filter((v) => linkedRefIds.has(v.id));
    if (nextHypotheses.length !== map.hypotheses.length) {
      nextMaps[incId] = { ...map, hypotheses: nextHypotheses };
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
