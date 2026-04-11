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
    title: `Remove “${inputTitle}”?`,
    description: 'The card and its saved spec text and images are cleared. Connections to this card are removed.',
    confirmLabel: 'Remove and clear facet',
  };
}

/** Tier T — structural incubator. */
function incubatorDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Remove incubator?',
    description:
      'Inputs stay on the canvas; hypotheses that depend only on this incubator may be affected. This cannot be undone on the canvas.',
    confirmLabel: 'Remove',
  };
}

/** Tier T — structural model node. */
function modelNodeDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Remove model node?',
    description: 'It will be disconnected from incubators and hypotheses. This cannot be undone on the canvas.',
    confirmLabel: 'Remove',
  };
}

/** Tier G — design system processing node. */
function designSystemNodeDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Remove design system?',
    description: 'Hypotheses lose this connection. You can add a design system node again from the toolbar.',
    confirmLabel: 'Remove',
  };
}

/** Tier G — preview (output) node. */
export function previewNodeDeleteCopy(previewLabel: string): PermanentDeleteCopy {
  return {
    title: `Remove “${previewLabel}”?`,
    description: 'Run the hypothesis again to create a new preview.',
    confirmLabel: 'Remove',
  };
}

export function previewVersionDeleteCopy(): PermanentDeleteCopy {
  return {
    title: 'Delete this version?',
    description: 'Other versions on this preview stay. This cannot be undone.',
    confirmLabel: 'Delete version',
  };
}

/** Tier G — hypothesis (and connected preview nodes when present). */
export function hypothesisDeleteCopy(previewCount: number): PermanentDeleteCopy {
  if (previewCount > 0) {
    const p = previewCount === 1 ? 'preview' : 'previews';
    return {
      title: 'Remove hypothesis?',
      description: `This removes the hypothesis and ${previewCount} linked ${p}. You cannot undo on the canvas.`,
      confirmLabel: 'Remove',
    };
  }
  return {
    title: 'Remove hypothesis?',
    description: 'You can add one again from the toolbar.',
    confirmLabel: 'Remove',
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
    title: `Remove ${n} nodes?`,
    description:
      'Selected nodes and their connections go away; removing a hypothesis also removes its previews. You cannot undo on the canvas.',
    confirmLabel: 'Remove',
  };
}
