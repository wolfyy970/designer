import { NODE_TYPES } from '../constants/canvas';
import { countOutgoingNodesOfType } from '../workspace/graph-queries';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

export type PermanentDeleteCopy = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/** Tier S — input cards: removal clears persisted spec for that spec facet. */
export function inputCardDeleteCopy(inputTitle: string): PermanentDeleteCopy {
  return {
    title: `Remove “${inputTitle}” from the canvas?`,
    description:
      'This removes the card and clears this facet in your saved document (text and images). An empty optional slot may show a placeholder again until you dismiss it. Connections are removed.',
    confirmLabel: 'Remove and clear facet',
  };
}

/** Tier T — structural incubator. */
function incubatorDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Remove Incubator from the canvas?',
    description:
      'This incubator node is removed permanently. Inputs stay on the canvas but are unwired from it. Hypotheses and strategies tied only to this incubator can be affected. This cannot be undone from the canvas.',
    confirmLabel: 'Remove permanently',
  };
}

/** Tier T — structural model node. */
function modelNodeDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Remove Model node from the canvas?',
    description:
      'This removes the model node permanently and disconnects it from any incubators or hypotheses. Rewiring later takes an extra step. This cannot be undone from the canvas.',
    confirmLabel: 'Remove permanently',
  };
}

/** Tier G — design system processing node. */
function designSystemNodeDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Remove Design System from the canvas?',
    description:
      'Removes this node from the canvas and unwires it from hypotheses. You can add a Design System node again from the toolbar or palette.',
    confirmLabel: 'Remove from canvas',
  };
}

/** Tier G — preview (output) node. */
export function previewNodeDeleteCopy(previewLabel: string): PermanentDeleteCopy {
  return {
    title: `Remove “${previewLabel}” from the canvas?`,
    description:
      'Removes this preview from the canvas. You can run the hypothesis again to add a new preview. Stored generation data may be cleaned up per retention.',
    confirmLabel: 'Remove from canvas',
  };
}

export function previewVersionDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Delete this generation version?',
    description:
      'This run is permanently removed from the version stack. Other versions on this preview stay. This cannot be undone.',
    confirmLabel: 'Delete version',
  };
}

/** Tier G — hypothesis (and connected preview nodes when present). */
export function hypothesisDeleteCopy(previewCount: number): PermanentDeleteCopy {
  if (previewCount > 0) {
    const p = previewCount === 1 ? 'preview' : 'previews';
    return {
      title: 'Remove this hypothesis from the canvas?',
      description: `Removes this hypothesis and ${previewCount} connected ${p} from the canvas. You can add a new hypothesis from the toolbar.`,
      confirmLabel: 'Remove from canvas',
    };
  }
  return {
    title: 'Remove this hypothesis from the canvas?',
    description:
      'Removes this hypothesis from the canvas and unwires it. You can add one again from the toolbar.',
    confirmLabel: 'Remove from canvas',
  };
}

/** Stable copy objects for hooks that must not see a new object every render. */
export const STATIC_NODE_DELETE_COPY = {
  incubator: incubatorDeleteCopy(),
  model: modelNodeDeleteCopy(),
  designSystem: designSystemNodeDeleteCopy(),
} as const;

/**
 * Keyboard-driven multi-delete: one warning for the current selection (Tier G/T only; input cards are protected).
 */
export function keyboardMultiDeleteCopy(
  removable: readonly WorkspaceNode[],
  allNodes: readonly WorkspaceNode[],
  edges: readonly WorkspaceEdge[],
): PermanentDeleteCopy {
  if (removable.length === 1) {
    const n = removable[0];
    const t = n.type;
    if (t === NODE_TYPES.HYPOTHESIS) {
      return hypothesisDeleteCopy(
        countOutgoingNodesOfType(n.id, NODE_TYPES.PREVIEW, { nodes: allNodes, edges }),
      );
    }
    if (t === NODE_TYPES.PREVIEW) {
      return previewNodeDeleteCopy('Preview');
    }
    if (t === NODE_TYPES.MODEL) return modelNodeDeleteCopy();
    if (t === NODE_TYPES.DESIGN_SYSTEM) return designSystemNodeDeleteCopy();
  }

  const n = removable.length;
  return {
    title: `Remove ${n} selected node${n === 1 ? '' : 's'} from the canvas?`,
    description:
      'Removes the selected nodes from the canvas. Connected edges go with them; deleting a hypothesis also removes its preview nodes. You can re-add supported nodes from the toolbar. This cannot be undone from the canvas.',
    confirmLabel: 'Remove from canvas',
  };
}
