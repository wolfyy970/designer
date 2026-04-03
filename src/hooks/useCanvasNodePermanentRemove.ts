import { useCallback } from 'react';
import { useNodeRemoval } from './useNodeRemoval';
import { useRequestPermanentDelete } from './useRequestPermanentDelete';

/**
 * Returns a callback that opens the permanent-delete dialog, then runs canvas removeNode on confirm.
 */
export function useCanvasNodePermanentRemove(
  nodeId: string,
  copy: { title: string; description: string },
): () => void {
  const remove = useNodeRemoval(nodeId);
  const { requestPermanentDelete } = useRequestPermanentDelete();

  return useCallback(() => {
    requestPermanentDelete({
      title: copy.title,
      description: copy.description,
      onConfirm: remove,
    });
  }, [copy.description, copy.title, remove, requestPermanentDelete]);
}
