import { useEffect } from 'react';
import { useCanvasStore } from '../../../stores/canvas-store';
import { SECTION_NODE_TYPES } from '../../../lib/canvas-layout';
import type { WorkspaceNode } from '../../../types/workspace-graph';
import { useRequestPermanentDelete } from '../../../hooks/useRequestPermanentDelete';
import { keyboardMultiDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';

/**
 * Delete/Backspace on selected nodes: same permanent-delete dialog as header X (see PermanentDeleteConfirmProvider).
 */
export function useNodeDeletion() {
  const nodes = useCanvasStore((s) => s.nodes);
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = nodes.filter((n) => (n as WorkspaceNode & { selected?: boolean }).selected);
        if (selected.length === 0) return;
        e.preventDefault();

        const PROTECTED = new Set<string>([
          'compiler',
          'sectionGhost',
          ...SECTION_NODE_TYPES,
        ]);

        const removable = selected.filter((n) => !PROTECTED.has(n.type));
        if (removable.length === 0) return;

        const { edges: storeEdges, nodes: storeNodes } = useCanvasStore.getState();
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
            const removeNode = useCanvasStore.getState().removeNode;
            removable.forEach((n) => removeNode(n.id));
          },
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, requestPermanentDelete]);
}
