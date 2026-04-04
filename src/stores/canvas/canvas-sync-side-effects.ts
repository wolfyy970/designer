/**
 * Domain-store updates driven by compile/generate sync paths — keeps the sync slice thinner.
 */
import type { GenerationResult } from '../../types/provider';
import type { WorkspaceNode } from '../../types/workspace-graph';
import { getPreviewNodeData } from '../../lib/canvas-node-data';
import { useWorkspaceDomainStore } from '../workspace-domain-store';

export function syncVariantSlotsAfterGenerate(
  hypothesisNodeId: string,
  results: GenerationResult[],
  nodeIdMap: Map<string, string>,
): void {
  const dom = useWorkspaceDomainStore.getState();
  for (const result of results) {
    const previewNodeId = nodeIdMap.get(result.strategyId) ?? null;
    dom.setPreviewSlot(hypothesisNodeId, result.strategyId, {
      previewNodeId,
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
    const previewD = getPreviewNodeData(n);
    const vsId = previewD?.strategyId;
    const pin = previewD?.pinnedRunId;
    if (vsId && pin) {
      dom.setPreviewSlot(hypothesisNodeId, vsId, { pinnedRunId: pin });
    }
  }
}
