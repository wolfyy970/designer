import { useEffect } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useRequestPermanentDelete } from '../../../hooks/useRequestPermanentDelete';
import { keyboardMultiDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import { removableWorkspaceNodesFromFlowSelection } from '../../../lib/canvas-keyboard-delete';

type FlowSelectionGetters = {
  getNodes: () => Node[];
  getEdges: () => Edge[];
};

/**
 * Delete/Backspace on selected nodes: same permanent-delete dialog as header X (see PermanentDeleteConfirmProvider).
 * Uses React Flow selection so it matches the canvas. Selected edges delete immediately (no modal).
 */
export function useNodeDeletion({ getNodes, getEdges }: FlowSelectionGetters) {
  const { requestPermanentDelete } = useRequestPermanentDelete();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      const selectedRf = getNodes().filter((n) => n.selected);
      const selectedEdges = getEdges().filter((edge) => edge.selected);

      if (selectedRf.length === 0 && selectedEdges.length === 0) return;
      e.preventDefault();

      const { nodes: storeNodes, edges: storeEdges, removeEdge, removeNode } = useCanvasStore.getState();

      const removable = removableWorkspaceNodesFromFlowSelection(selectedRf, storeNodes);

      if (removable.length === 0 && selectedEdges.length > 0) {
        selectedEdges.forEach((edge) => removeEdge(edge.id));
        return;
      }

      if (removable.length === 0) return;

      const { title, description, confirmLabel, cancelLabel } = keyboardMultiDeleteCopy(
        removable,
        storeNodes,
        storeEdges,
      );
      requestPermanentDelete({
        title,
        description,
        confirmLabel,
        cancelLabel,
        onConfirm: () => {
          removable.forEach((n) => removeNode(n.id));
        },
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getNodes, getEdges, requestPermanentDelete]);
}
