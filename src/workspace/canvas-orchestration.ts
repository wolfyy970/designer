/**
 * Cross-store canvas orchestration: incubator, spec, and workspace-domain updates tied to graph edits.
 *
 * Dependencies are explicit: `useIncubatorStore`, `useSpecStore`, `useWorkspaceDomainStore` via `.getState()`.
 * The canvas graph slice calls these entry points; it does not mutate sibling stores directly.
 */
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
import { NODE_TYPES, INPUT_NODE_TYPES } from '../constants/canvas';
import {
  getDesignSystemNodeData,
  getHypothesisNodeData,
  getModelNodeData,
} from '../lib/canvas-node-data';
import { generateId, now } from '../lib/utils';
import { useIncubatorStore } from '../stores/incubator-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { findIncubatorForHypothesis } from './graph-queries';
import { hydrateDomainFromCanvasGraph } from './hydrate-domain-from-canvas-graph';

/**
 * Compiler map + domain link when adding a hypothesis node (after node id exists).
 * @returns variant refId for `newNode.data.refId` when created.
 */
export function ensureCompilerVariantAndDomainForHypothesis(
  hypothesisNodeId: string,
  canvasNodes: WorkspaceNode[],
  edges: Pick<WorkspaceEdge, 'source' | 'target'>[],
): string | undefined {
  const compilerStore = useIncubatorStore.getState();
  const compilerNodes = canvasNodes
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
    domainIncubator != null && compilerNodes.some((c) => c.id === domainIncubator);
  const targetCompilerId =
    fromGraph ?? (domainIsValid ? domainIncubator : null) ?? compilerNodes[0]?.id ?? 'manual';

  if (!compilerStore.incubationPlans[targetCompilerId]) {
    const spec = useSpecStore.getState().spec;
    compilerStore.setPlanForNode(targetCompilerId, {
      id: generateId(),
      specId: spec.id,
      dimensions: [],
      hypotheses: [],
      generatedAt: now(),
      incubatorModel: 'manual',
    });
  }
  compilerStore.addStrategyToNode(targetCompilerId);
  const map = compilerStore.incubationPlans[targetCompilerId];
  const lastVariant = map?.hypotheses[map.hypotheses.length - 1];
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
