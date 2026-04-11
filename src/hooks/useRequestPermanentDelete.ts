import { useContext } from 'react';
import { PermanentDeleteConfirmContext } from '../contexts/permanent-delete-confirm-context';

export function useRequestPermanentDelete() {
  const ctx = useContext(PermanentDeleteConfirmContext);
  if (!ctx) {
    throw new Error(
      'useRequestPermanentDelete must be used within PermanentDeleteConfirmProvider',
    );
  }
  return ctx;
}
