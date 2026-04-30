import { useCallback } from 'react';
import type { Connection } from '@xyflow/react';
import { useCanvasStore } from '../../../stores/canvas-store';

/**
 * Hook to route canvas edge creation through the graph store and then settle layout.
 */
export function useFeedbackLoopConnection() {
  const storeOnConnect = useCanvasStore((s) => s.onConnect);

  const handleConnect = useCallback(
    (connection: Connection) => {
      storeOnConnect(connection);
      useCanvasStore.getState().applyAutoLayout();
    },
    [storeOnConnect]
  );

  return { handleConnect };
}
