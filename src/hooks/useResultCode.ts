import { useState, useEffect } from 'react';
import { normalizeError } from '../lib/error-utils';
import { loadCode } from '../services/idb-storage';

/** Dedupe dev logs: many preview nodes + Strict Mode would spam the same missing IDs. */
const missingCodeDevLogged = new Set<string>();

/**
 * Load generated code from IndexedDB for a given result ID.
 * Returns undefined while loading — consumers should show loading state.
 */
export function useResultCode(resultId: string | undefined, reloadTrigger?: unknown): {
  code: string | undefined;
  isLoading: boolean;
} {
  const [code, setCode] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(!!resultId);

  useEffect(() => {
    if (!resultId) {
      setCode(undefined);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    loadCode(resultId)
      .then((c) => {
        if (!cancelled) {
          if (import.meta.env.DEV && !c && !missingCodeDevLogged.has(resultId)) {
            missingCodeDevLogged.add(resultId);
            // Expected when pins reference runs cleared from IDB or from another session.
            console.debug(
              `[useResultCode] No code in IndexedDB for result ${resultId.slice(0, 8)}…`,
            );
          }
          setCode(c);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(
            `[useResultCode] Error loading code for ${resultId.slice(0, 8)}...`,
            normalizeError(err),
            err,
          );
          setCode(undefined);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resultId, reloadTrigger]);

  return { code, isLoading };
}
