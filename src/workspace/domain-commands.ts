/**
 * Keep `useWorkspaceDomainStore` in sync with canvas graph edits so compile/generate
 * can read domain relations instead of relying on edge walks alone.
 */
import { NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../types/workspace-graph';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { SECTION_NODE_TYPES } from '../lib/canvas-layout';
import { getHypothesisRefId, isPlaceholderHypothesis } from '../lib/hypothesis-node-utils';
import { findIncubatorForHypothesis, workspaceNodeById } from './graph-queries';

/** After the canvas adds an edge, update domain bindings. */
export function syncDomainForNewEdge(
  edge: Pick<WorkspaceEdge, 'source' | 'target'>,
  nodes: WorkspaceNode[],
  allEdges: WorkspaceEdge[],
): void {
  const src = workspaceNodeById(nodes, edge.source);
  const tgt = workspaceNodeById(nodes, edge.target);
  if (!src || !tgt) return;

  const d = useWorkspaceDomainStore.getState();

  if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.HYPOTHESIS) {
    const refId = getHypothesisRefId(tgt);
    const inc = findIncubatorForHypothesis(nodes, allEdges, tgt.id);
    if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
    d.setHypothesisPlaceholder(tgt.id, isPlaceholderHypothesis(tgt.data));
    d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    return;
  }

  if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.COMPILER) {
    d.ensureIncubatorWiring(tgt.id);
    d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.COMPILER);
    return;
  }

  if (src.type === NODE_TYPES.COMPILER && tgt.type === NODE_TYPES.HYPOTHESIS) {
    const refId = getHypothesisRefId(tgt);
    if (refId) d.linkHypothesisToIncubator(tgt.id, src.id, refId);
    d.setHypothesisPlaceholder(tgt.id, isPlaceholderHypothesis(tgt.data));
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

  if (src.type === NODE_TYPES.DESIGN_SYSTEM && tgt.type === NODE_TYPES.HYPOTHESIS) {
    d.attachDesignSystemToHypothesis(src.id, tgt.id);
    const refId = getHypothesisRefId(tgt);
    const inc = findIncubatorForHypothesis(nodes, allEdges, tgt.id);
    if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
  }
}

export function syncDomainForRemovedEdge(edge: Pick<WorkspaceEdge, 'source' | 'target'>, nodes: WorkspaceNode[]): void {
  const src = workspaceNodeById(nodes, edge.source);
  const tgt = workspaceNodeById(nodes, edge.target);
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

  if (node.type === NODE_TYPES.VARIANT) {
    // Clear any slot that still points at this canvas node (active or pinned); otherwise
    // generation / overlay logic keeps stale bindings and the next sync can resurrect a variant.
    const slotClears: { hypothesisId: string; variantStrategyId: string }[] = [];
    for (const slot of Object.values(d.variantSlots)) {
      if (slot.variantNodeId === node.id) {
        slotClears.push({
          hypothesisId: slot.hypothesisId,
          variantStrategyId: slot.variantStrategyId,
        });
      }
    }
    for (const { hypothesisId, variantStrategyId } of slotClears) {
      d.setVariantSlot(hypothesisId, variantStrategyId, {
        variantNodeId: null,
        activeResultId: null,
      });
    }
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
