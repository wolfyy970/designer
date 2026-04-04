import { NODE_TYPES } from '../constants/canvas';
import { countOutgoingNodesOfType } from '../workspace/graph-queries';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

/** User-facing copy for permanent canvas deletion (single section / input card). */
export function sectionCardDeleteCopy(sectionTitle: string): { title: string; description: string } {
  return {
    title: `Remove “${sectionTitle}” from the canvas?`,
    description:
      'If you continue, this card is deleted permanently: it disappears from the canvas and its connections are removed. This cannot be undone from the canvas. Text you entered may still exist in the shared project spec until you change it elsewhere.',
  };
}

export function incubatorDeleteCopy(): { title: string; description: string } {
  return {
    title: 'Remove Incubator from the canvas?',
    description:
      'If you continue, this node is deleted permanently. Connected inputs stay on the canvas but are unwired from this incubator. Hypotheses and strategies tied only to this incubator may be affected. This cannot be undone from the canvas.',
  };
}

export function modelNodeDeleteCopy(): { title: string; description: string } {
  return {
    title: 'Remove Model node from the canvas?',
    description:
      'If you continue, this model node is deleted permanently and disconnected from any Incubators or Hypotheses. This cannot be undone from the canvas.',
  };
}

export function designSystemNodeDeleteCopy(): { title: string; description: string } {
  return {
    title: 'Remove Design System from the canvas?',
    description:
      'If you continue, this Design System node and its content are removed permanently from the canvas and unwired from hypotheses. This cannot be undone from the canvas.',
  };
}

export function variantNodeDeleteCopy(variantLabel: string): { title: string; description: string } {
  return {
    title: `Remove “${variantLabel}” from the canvas?`,
    description:
      'If you continue, this variant node is deleted permanently: it disappears from the canvas and its edges are removed. Stored generation data may be cleaned up according to retention rules. This cannot be undone from the canvas.',
  };
}

export function variantVersionDeleteCopy(): { title: string; description: string } {
  return {
    title: 'Delete this generation version?',
    description:
      'If you continue, this run is permanently removed from the version stack. Other versions on this variant card stay. This cannot be undone.',
  };
}

export function hypothesisDeleteCopy(variantCount: number): { title: string; description: string } {
  if (variantCount > 0) {
    const v = variantCount === 1 ? 'variant' : 'variants';
    return {
      title: 'Delete this hypothesis permanently?',
      description: `If you continue, this hypothesis and ${variantCount} connected ${v} are deleted permanently from the canvas. This cannot be undone from the canvas.`,
    };
  }
  return {
    title: 'Delete this hypothesis permanently?',
    description:
      'If you continue, this hypothesis is removed permanently from the canvas and unwired. This cannot be undone from the canvas.',
  };
}

/**
 * Keyboard-driven multi-delete: build one warning for the current selection.
 */
/** Stable copy objects for hooks that must not see a new object every render. */
export const STATIC_NODE_DELETE_COPY = {
  incubator: incubatorDeleteCopy(),
  model: modelNodeDeleteCopy(),
  designSystem: designSystemNodeDeleteCopy(),
} as const;

export function keyboardMultiDeleteCopy(
  removable: readonly WorkspaceNode[],
  allNodes: readonly WorkspaceNode[],
  edges: readonly WorkspaceEdge[],
): { title: string; description: string } {
  if (removable.length === 1) {
    const n = removable[0];
    const t = n.type;
    if (t === NODE_TYPES.HYPOTHESIS) {
      return hypothesisDeleteCopy(countOutgoingNodesOfType(n.id, NODE_TYPES.VARIANT, { nodes: allNodes, edges }));
    }
    if (t === NODE_TYPES.VARIANT) {
      return variantNodeDeleteCopy('Variant');
    }
    if (t === NODE_TYPES.MODEL) return modelNodeDeleteCopy();
    if (t === NODE_TYPES.DESIGN_SYSTEM) return designSystemNodeDeleteCopy();
  }

  const n = removable.length;
  return {
    title: `Delete ${n} selected node${n === 1 ? '' : 's'} permanently?`,
    description:
      'If you continue, the selected nodes are removed permanently from the canvas. Connected edges are removed; hypotheses may take their variant nodes with them. This cannot be undone from the canvas.',
  };
}
