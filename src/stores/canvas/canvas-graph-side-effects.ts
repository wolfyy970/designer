/**
 * Cross-store reactions for canvas graph edits — keeps the graph slice focused on
 * nodes/edges while compiler, spec, and domain updates live here.
 */
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import {
  getDesignSystemNodeData,
  getHypothesisNodeData,
  getModelNodeData,
} from '../../lib/canvas-node-data';
import { generateId, now } from '../../lib/utils';
import { useCompilerStore } from '../compiler-store';
import { useSpecStore } from '../spec-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import { NODE_TYPE_TO_SECTION } from '../../types/workspace-graph';
import { SECTION_NODE_TYPES } from '../../lib/canvas-layout';
import { hydrateDomainFromCanvasGraph } from '../workspace-domain-store';

/**
 * Compiler map + domain link when adding a hypothesis node (after node id exists).
 * @returns variant refId for `newNode.data.refId` when created.
 */
export function ensureCompilerVariantAndDomainForHypothesis(
  hypothesisNodeId: string,
  canvasNodes: WorkspaceNode[],
): string | undefined {
  const compilerStore = useCompilerStore.getState();
  const compilerNodes = canvasNodes.filter((n) => n.type === 'compiler');
  const targetCompilerId = compilerNodes[0]?.id ?? 'manual';

  if (!compilerStore.dimensionMaps[targetCompilerId]) {
    const spec = useSpecStore.getState().spec;
    compilerStore.setDimensionMapForNode(targetCompilerId, {
      id: generateId(),
      specId: spec.id,
      dimensions: [],
      variants: [],
      generatedAt: now(),
      compilerModel: 'manual',
    });
  }
  compilerStore.addVariantToNode(targetCompilerId);
  const map = compilerStore.dimensionMaps[targetCompilerId];
  const lastVariant = map?.variants[map.variants.length - 1];
  if (lastVariant) {
    useWorkspaceDomainStore
      .getState()
      .linkHypothesisToIncubator(hypothesisNodeId, targetCompilerId, lastVariant.id);
    return lastVariant.id;
  }
  return undefined;
}

/** Reset spec section when removing a section-type canvas node. */
export function resetSpecSectionForRemovedNode(node: WorkspaceNode): void {
  const removedType = node.type as CanvasNodeType;
  if (!SECTION_NODE_TYPES.has(removedType)) return;
  const sectionId = NODE_TYPE_TO_SECTION[removedType];
  if (sectionId) {
    useSpecStore.getState().resetSectionContent(sectionId);
  }
}

export function removeCompilerDimensionMapForNode(compilerNodeId: string): void {
  useCompilerStore.getState().removeDimensionMapForNode(compilerNodeId);
}

export function removeCompilerVariantByRefId(refId: string): void {
  useCompilerStore.getState().removeVariant(refId);
}

/** Re-hydrate domain from full graph after optional sections materialize. */
export function hydrateDomainAfterSpecMaterialize(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[],
): void {
  hydrateDomainFromCanvasGraph({
    nodes: nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
    edges,
  });
}

/** Mirror hypothesis / model / design-system node data into the workspace domain store. */
export function syncNodeDataToWorkspaceDomain(
  node: WorkspaceNode,
  mergedNode: WorkspaceNode,
  patch: Record<string, unknown>,
): void {
  const dom = useWorkspaceDomainStore.getState();
  if (node.type === 'hypothesis') {
    if ('agentMode' in patch) {
      const h = getHypothesisNodeData(mergedNode);
      if (h?.agentMode != null) {
        dom.setHypothesisGenerationSettings(node.id, { agentMode: h.agentMode });
      }
    }
  }
  if (node.type === 'model') {
    const m = getModelNodeData(mergedNode);
    if (m) {
      dom.upsertModelProfile(node.id, {
        providerId: m.providerId,
        modelId: m.modelId,
        title: m.title,
        thinkingLevel: m.thinkingLevel ?? 'minimal',
      });
    }
  }
  if (node.type === 'designSystem') {
    const ds = getDesignSystemNodeData(mergedNode);
    if (ds) {
      dom.upsertDesignSystem(node.id, {
        title: ds.title ?? '',
        content: ds.content ?? '',
        images: ds.images ?? [],
        providerMigration: ds.providerId,
        modelMigration: ds.modelId,
      });
    }
  }
}
