/**
 * Keep `useWorkspaceDomainStore` in sync with canvas graph edits so compile/generate
 * can read domain relations instead of relying on edge walks alone.
 */
import { NODE_TYPES, INPUT_NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../types/workspace-graph';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { workspaceNodeById } from './graph-queries';
import {
  applyIncrementalNewEdgeRules,
  applyIncrementalRemovedEdgeRules,
} from './edge-domain-rules';

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
  applyIncrementalNewEdgeRules({ d, src, tgt, nodes, allEdges });
}

export function syncDomainForRemovedEdge(edge: Pick<WorkspaceEdge, 'source' | 'target'>, nodes: WorkspaceNode[]): void {
  const src = workspaceNodeById(nodes, edge.source);
  const tgt = workspaceNodeById(nodes, edge.target);
  if (!src || !tgt) return;

  const d = useWorkspaceDomainStore.getState();
  applyIncrementalRemovedEdgeRules({ d, src, tgt });
}

export function syncDomainForRemovedNode(node: WorkspaceNode): void {
  const d = useWorkspaceDomainStore.getState();

  if (node.type === NODE_TYPES.INCUBATOR) {
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

  if (node.type === NODE_TYPES.PREVIEW) {
    // Clear any slot that still points at this canvas node (active or pinned); otherwise
    // generation / overlay logic keeps stale bindings and the next sync can resurrect a variant.
    const slotClears: { hypothesisId: string; strategyId: string }[] = [];
    for (const slot of Object.values(d.previewSlots)) {
      if (slot.previewNodeId === node.id) {
        slotClears.push({
          hypothesisId: slot.hypothesisId,
          strategyId: slot.strategyId,
        });
      }
    }
    for (const { hypothesisId, strategyId } of slotClears) {
      d.setPreviewSlot(hypothesisId, strategyId, {
        previewNodeId: null,
        activeResultId: null,
      });
    }
    for (const incId of Object.keys(d.incubatorWirings)) {
      d.detachIncubatorInput(incId, node.id, NODE_TYPES.PREVIEW);
    }
    return;
  }

  if (INPUT_NODE_TYPES.has(node.type as CanvasNodeType)) {
    for (const incId of Object.keys(d.incubatorWirings)) {
      d.detachIncubatorInput(incId, node.id, node.type as CanvasNodeType);
    }
  }
}

/** Link each new hypothesis to the incubator in domain after compile. */
export function linkHypothesesAfterIncubate(
  compilerNodeId: string,
  pairs: readonly { hypothesisNodeId: string; strategyId: string }[],
): void {
  const d = useWorkspaceDomainStore.getState();
  for (const { hypothesisNodeId, strategyId } of pairs) {
    d.linkHypothesisToIncubator(hypothesisNodeId, compilerNodeId, strategyId);
    d.setHypothesisPlaceholder(hypothesisNodeId, false);
  }
}
