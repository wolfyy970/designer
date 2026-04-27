import { NODE_TYPES } from '../constants/canvas';
import type { WorkspaceNode } from '../types/workspace-graph';

/** Node types that cannot be removed via keyboard Delete/Backspace. */
export const KEYBOARD_DELETE_PROTECTED_NODE_TYPES = new Set<string>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.MODEL,
  NODE_TYPES.INCUBATOR,
  'inputGhost',
]);

/**
 * Maps React-Flow-selected nodes to workspace nodes that are allowed for keyboard-driven permanent delete.
 * Unknown ids or protected types are omitted.
 */
export function removableWorkspaceNodesFromFlowSelection(
  selectedFlowNodes: ReadonlyArray<{ id: string; type?: string | null }>,
  storeNodes: ReadonlyArray<WorkspaceNode>,
): WorkspaceNode[] {
  return selectedFlowNodes
    .map((fn) => storeNodes.find((sn) => sn.id === fn.id))
    .filter(
      (n): n is WorkspaceNode =>
        !!n && !KEYBOARD_DELETE_PROTECTED_NODE_TYPES.has(n.type),
    );
}
