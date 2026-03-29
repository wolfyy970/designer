/**
 * Keep `useWorkspaceDomainStore` in sync with canvas graph edits so compile/generate
 * can read domain relations instead of relying on edge walks alone.
 */
import { NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../types/workspace-graph';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { SECTION_NODE_TYPES } from '../lib/canvas-layout';

function nodeById(nodes: WorkspaceNode[], id: string): WorkspaceNode | undefined {
  return nodes.find((n) => n.id === id);
}

function findIncubatorForHypothesis(edges: WorkspaceEdge[], nodes: WorkspaceNode[], hypothesisId: string): string | null {
  for (const e of edges) {
    if (e.target !== hypothesisId) continue;
    const n = nodeById(nodes, e.source);
    if (n?.type === NODE_TYPES.COMPILER) return n.id;
  }
  return null;
}

/** After the canvas adds an edge, update domain bindings. */
export function syncDomainForNewEdge(
  edge: Pick<WorkspaceEdge, 'source' | 'target'>,
  nodes: WorkspaceNode[],
  allEdges: WorkspaceEdge[],
): void {
  const src = nodeById(nodes, edge.source);
  const tgt = nodeById(nodes, edge.target);
  if (!src || !tgt) return;

  const d = useWorkspaceDomainStore.getState();

  if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.HYPOTHESIS) {
    const refId = (tgt.data as { refId?: string })?.refId;
    const inc = findIncubatorForHypothesis(allEdges, nodes, tgt.id);
    if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
    d.setHypothesisPlaceholder(tgt.id, Boolean((tgt.data as { placeholder?: boolean }).placeholder));
    d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    return;
  }

  if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.COMPILER) {
    d.ensureIncubatorWiring(tgt.id);
    d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.COMPILER);
    return;
  }

  if (src.type === NODE_TYPES.COMPILER && tgt.type === NODE_TYPES.HYPOTHESIS) {
    const refId = (tgt.data as { refId?: string })?.refId;
    if (refId) d.linkHypothesisToIncubator(tgt.id, src.id, refId);
    d.setHypothesisPlaceholder(tgt.id, Boolean((tgt.data as { placeholder?: boolean }).placeholder));
    return;
  }

  if (SECTION_NODE_TYPES.has(src.type as CanvasNodeType) && tgt.type === NODE_TYPES.COMPILER) {
    d.ensureIncubatorWiring(tgt.id);
    d.attachIncubatorInput(tgt.id, src.id, src.type as CanvasNodeType);
    return;
  }

  if (src.type === NODE_TYPES.VARIANT && tgt.type === NODE_TYPES.COMPILER) {
    d.ensureIncubatorWiring(tgt.id);
    d.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.VARIANT);
    return;
  }

  if (src.type === NODE_TYPES.CRITIQUE && tgt.type === NODE_TYPES.COMPILER) {
    d.ensureIncubatorWiring(tgt.id);
    d.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.CRITIQUE);
    return;
  }

  if (src.type === NODE_TYPES.DESIGN_SYSTEM && tgt.type === NODE_TYPES.HYPOTHESIS) {
    d.attachDesignSystemToHypothesis(src.id, tgt.id);
    const refId = (tgt.data as { refId?: string })?.refId;
    const inc = findIncubatorForHypothesis(allEdges, nodes, tgt.id);
    if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
  }
}

export function syncDomainForRemovedEdge(edge: Pick<WorkspaceEdge, 'source' | 'target'>, nodes: WorkspaceNode[]): void {
  const src = nodeById(nodes, edge.source);
  const tgt = nodeById(nodes, edge.target);
  if (!src || !tgt) return;

  const d = useWorkspaceDomainStore.getState();

  if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.HYPOTHESIS) {
    d.detachModelFromTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    return;
  }
  if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.COMPILER) {
    d.detachModelFromTarget(src.id, tgt.id, NODE_TYPES.COMPILER);
    return;
  }
  if (SECTION_NODE_TYPES.has(src.type as CanvasNodeType) && tgt.type === NODE_TYPES.COMPILER) {
    d.detachIncubatorInput(tgt.id, src.id, src.type as CanvasNodeType);
    return;
  }
  if (src.type === NODE_TYPES.VARIANT && tgt.type === NODE_TYPES.COMPILER) {
    d.detachIncubatorInput(tgt.id, src.id, NODE_TYPES.VARIANT);
    return;
  }
  if (src.type === NODE_TYPES.CRITIQUE && tgt.type === NODE_TYPES.COMPILER) {
    d.detachIncubatorInput(tgt.id, src.id, NODE_TYPES.CRITIQUE);
    return;
  }
  if (src.type === NODE_TYPES.DESIGN_SYSTEM && tgt.type === NODE_TYPES.HYPOTHESIS) {
    d.detachDesignSystemFromHypothesis(src.id, tgt.id);
  }
}

export function syncDomainForRemovedNode(node: WorkspaceNode): void {
  const d = useWorkspaceDomainStore.getState();

  if (node.type === NODE_TYPES.COMPILER) {
    d.removeIncubator(node.id);
    return;
  }
  if (node.type === NODE_TYPES.HYPOTHESIS) {
    d.removeHypothesis(node.id);
    return;
  }
  if (node.type === NODE_TYPES.MODEL) {
    d.purgeModelNode(node.id);
    return;
  }
  if (node.type === NODE_TYPES.DESIGN_SYSTEM) {
    d.removeDesignSystem(node.id);
    for (const h of Object.values(d.hypotheses)) {
      if (h.designSystemNodeIds.includes(node.id)) {
        d.detachDesignSystemFromHypothesis(node.id, h.id);
      }
    }
    return;
  }
  if (node.type === NODE_TYPES.CRITIQUE) {
    d.removeCritique(node.id);
    for (const incId of Object.keys(d.incubatorWirings)) {
      d.detachIncubatorInput(incId, node.id, NODE_TYPES.CRITIQUE);
    }
    return;
  }

  if (node.type === NODE_TYPES.VARIANT) {
    for (const incId of Object.keys(d.incubatorWirings)) {
      d.detachIncubatorInput(incId, node.id, NODE_TYPES.VARIANT);
    }
    return;
  }

  if (SECTION_NODE_TYPES.has(node.type as CanvasNodeType)) {
    for (const incId of Object.keys(d.incubatorWirings)) {
      d.detachIncubatorInput(incId, node.id, node.type as CanvasNodeType);
    }
  }
}

/** Link each new hypothesis to the incubator in domain after compile. */
export function linkHypothesesAfterCompile(
  compilerNodeId: string,
  pairs: readonly { hypothesisNodeId: string; variantStrategyId: string }[],
): void {
  const d = useWorkspaceDomainStore.getState();
  for (const { hypothesisNodeId, variantStrategyId } of pairs) {
    d.linkHypothesisToIncubator(hypothesisNodeId, compilerNodeId, variantStrategyId);
    d.setHypothesisPlaceholder(hypothesisNodeId, false);
  }
}
