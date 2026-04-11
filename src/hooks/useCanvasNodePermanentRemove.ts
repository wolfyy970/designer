import { useCallback } from 'react';
import type { PermanentDeleteCopy } from '../lib/canvas-permanent-delete-copy';
import { useNodeRemoval } from './useNodeRemoval';
import { useRequestPermanentDelete } from './useRequestPermanentDelete';

/**
 * Returns a callback that opens the permanent-delete dialog, then runs canvas removeNode on confirm.
 */
export function useCanvasNodePermanentRemove(nodeId: string, copy: PermanentDeleteCopy): () => void {
  const remove = useNodeRemoval(nodeId);
  const { requestPermanentDelete } = useRequestPermanentDelete();

  return useCallback(() => {
    requestPermanentDelete({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      cancelLabel: copy.cancelLabel,
      onConfirm: remove,
    });
  }, [
    copy.cancelLabel,
    copy.confirmLabel,
    copy.description,
    copy.title,
    remove,
    requestPermanentDelete,
  ]);
}
