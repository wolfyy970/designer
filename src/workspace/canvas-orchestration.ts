/**
 * Cross-store canvas orchestration: incubator, spec, and workspace-domain updates tied to graph edits.
 *
 * Dependencies are explicit: `useIncubatorStore`, `useSpecStore`, `useWorkspaceDomainStore` via `.getState()`.
 * The canvas graph slice calls these entry points; it does not mutate sibling stores directly.
 */
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
import { NODE_TYPES, INPUT_NODE_TYPES } from '../constants/canvas';
import { getDesignSystemNodeData, getModelNodeData } from '../lib/canvas-node-data';
import { generateId, now } from '../lib/utils';
import { useIncubatorStore } from '../stores/incubator-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { findIncubatorForHypothesis } from './graph-queries';
import { hydrateDomainFromCanvasGraph } from './hydrate-domain-from-canvas-graph';

/**
 * When a hypothesis node is added, ensure the incubator plan has a matching strategy row
 * and link domain state. Returns the new **strategy id** for `hypothesisNode.data.refId`.
 */
export function ensureHypothesisStrategyBinding(
  hypothesisNodeId: string,
  canvasNodes: WorkspaceNode[],
  edges: Pick<WorkspaceEdge, 'source' | 'target'>[],
): string | undefined {
  const incubatorNodes = canvasNodes
    .filter((n) => n.type === NODE_TYPES.INCUBATOR)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const fromGraph = findIncubatorForHypothesis(
    {
      nodes: canvasNodes.map((n) => ({ id: n.id, type: n.type })),
      edges,
    },
    hypothesisNodeId,
  );
  const domainIncubator = useWorkspaceDomainStore.getState().hypotheses[hypothesisNodeId]?.incubatorId;
  const domainIsValid =
    domainIncubator != null && incubatorNodes.some((c) => c.id === domainIncubator);
  const targetIncubatorId =
    fromGraph ?? (domainIsValid ? domainIncubator : null) ?? incubatorNodes[0]?.id ?? 'manual';

  if (!useIncubatorStore.getState().incubationPlans[targetIncubatorId]) {
    const spec = useSpecStore.getState().spec;
    useIncubatorStore.getState().setPlanForNode(targetIncubatorId, {
      id: generateId(),
      specId: spec.id,
      dimensions: [],
      hypotheses: [],
      generatedAt: now(),
      incubatorModel: 'manual',
    });
  }
  useIncubatorStore.getState().addStrategyToNode(targetIncubatorId);
  // Must read fresh state after `addStrategyToNode` — a captured getState() snapshot is stale.
  const map = useIncubatorStore.getState().incubationPlans[targetIncubatorId];
  const lastStrategy = map?.hypotheses[map.hypotheses.length - 1];
  if (lastStrategy) {
    useWorkspaceDomainStore
      .getState()
      .linkHypothesisToIncubator(hypothesisNodeId, targetIncubatorId, lastStrategy.id);
    return lastStrategy.id;
  }
  return undefined;
}

/** Reset spec section when removing a section-type canvas node. */
export function resetSpecSectionForRemovedNode(node: WorkspaceNode): void {
  const removedType = node.type as CanvasNodeType;
  if (!INPUT_NODE_TYPES.has(removedType)) return;
  const sectionId = NODE_TYPE_TO_SECTION[removedType];
  if (sectionId) {
    useSpecStore.getState().resetSectionContent(sectionId);
  }
}

export function removeCompilerPlanForNode(compilerNodeId: string): void {
  useIncubatorStore.getState().removePlanForNode(compilerNodeId);
}

export function removeCompilerStrategyByRefId(refId: string): void {
  useIncubatorStore.getState().removeStrategy(refId);
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
  void patch;
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
        markdownSources: ds.markdownSources ?? [],
        designMdDocument: ds.designMdDocument,
        providerMigration: ds.providerId,
        modelMigration: ds.modelId,
      });
    }
  }
}
