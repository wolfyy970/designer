import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PermanentDeleteConfirmDialog } from '../components/shared/PermanentDeleteConfirmDialog';
import {
  PermanentDeleteConfirmContext,
  type PermanentDeleteRequest,
} from './permanent-delete-confirm-context';

export function PermanentDeleteConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PermanentDeleteRequest | null>(null);
  const pendingRef = useRef<PermanentDeleteRequest | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const requestPermanentDelete = useCallback((req: PermanentDeleteRequest) => {
    setPending(req);
  }, []);

  const handleCancel = useCallback(() => setPending(null), []);

  const handleConfirm = useCallback(() => {
    const req = pendingRef.current;
    setPending(null);
    req?.onConfirm();
  }, []);

  const value = useMemo(
    () => ({ requestPermanentDelete }),
    [requestPermanentDelete],
  );

  return (
    <PermanentDeleteConfirmContext.Provider value={value}>
      {children}
      <PermanentDeleteConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description ?? null}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </PermanentDeleteConfirmContext.Provider>
  );
}
