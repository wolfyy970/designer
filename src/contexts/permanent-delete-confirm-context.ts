import { createContext, type ReactNode } from 'react';

export type PermanentDeleteRequest = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
};

export type PermanentDeleteConfirmContextValue = {
  requestPermanentDelete: (req: PermanentDeleteRequest) => void;
};

export const PermanentDeleteConfirmContext =
  createContext<PermanentDeleteConfirmContextValue | null>(null);
