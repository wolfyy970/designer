/**
 * Domain-store updates driven by compile/generate sync paths — keeps the sync slice thinner.
 */
import type { GenerationResult } from '../../types/provider';
import type { WorkspaceNode } from '../../types/workspace-graph';
import { getVariantNodeData } from '../../lib/canvas-node-data';
import { useWorkspaceDomainStore } from '../workspace-domain-store';

export function syncVariantSlotsAfterGenerate(
  hypothesisNodeId: string,
  results: GenerationResult[],
  nodeIdMap: Map<string, string>,
): void {
  const dom = useWorkspaceDomainStore.getState();
  for (const result of results) {
    const variantNodeId = nodeIdMap.get(result.variantStrategyId) ?? null;
    dom.setVariantSlot(hypothesisNodeId, result.variantStrategyId, {
      variantNodeId,
      activeResultId: result.id,
    });
  }
}

export function syncVariantSlotsAfterFork(
  hypothesisNodeId: string,
  nodes: WorkspaceNode[],
  variantIdSet: Set<string>,
): void {
  const dom = useWorkspaceDomainStore.getState();
  for (const n of nodes) {
    if (!variantIdSet.has(n.id)) continue;
    const variantD = getVariantNodeData(n);
    const vsId = variantD?.variantStrategyId;
    const pin = variantD?.pinnedRunId;
    if (vsId && pin) {
      dom.setVariantSlot(hypothesisNodeId, vsId, { pinnedRunId: pin });
    }
  }
}
