import { useState, useEffect } from 'react';
import { loadFiles } from '../services/idb-storage';
import { GENERATION_STATUS } from '../constants/generation';
import type { GenerationStatus } from '../types/provider';

/**
 * Load virtual filesystem files from IndexedDB for a given result ID.
 * Only loads when status is COMPLETE. Returns undefined while loading.
 */
export function useResultFiles(
  resultId: string | undefined,
  status: GenerationStatus | undefined,
): {
  files: Record<string, string> | undefined;
  isLoading: boolean;
} {
  const [files, setFiles] = useState<Record<string, string> | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!resultId || status !== GENERATION_STATUS.COMPLETE) {
      setFiles(undefined);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    loadFiles(resultId)
      .then((f) => {
        if (!cancelled) {
          setFiles(f);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`[useResultFiles] Error loading files for ${resultId.slice(0, 8)}...`, err);
          setFiles(undefined);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resultId, status]);

  return { files, isLoading };
}
