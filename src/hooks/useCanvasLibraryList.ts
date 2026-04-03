import { useCallback, useEffect, useState } from 'react';
import { getCanvasList } from '../services/persistence';

/** Library rows for Canvas Manager; refresh when the modal opens or after mutations. */
export function useCanvasLibraryList(open: boolean) {
  const [specs, setSpecs] = useState(() => getCanvasList());
  const refresh = useCallback(() => setSpecs(getCanvasList()), []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  return { specs, refresh };
}
