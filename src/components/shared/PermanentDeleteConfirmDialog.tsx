import { useEffect, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface PermanentDeleteConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal for irreversible canvas deletions — uses status/error tokens (not accent).
 */
export function PermanentDeleteConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete permanently',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
}: PermanentDeleteConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-overlay"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permanent-delete-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface-raised shadow-xl"
      >
        <div className="flex gap-3 border-b border-border-subtle px-4 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error-subtle text-error"
            aria-hidden
          >
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="permanent-delete-title" className="text-sm font-semibold text-fg">
              {title}
            </h2>
          </div>
        </div>
        <div className="px-4 py-3 text-nano leading-relaxed text-fg-secondary">{description}</div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-nano font-medium text-fg-secondary transition-colors hover:bg-surface-raised hover:text-fg"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-error/35 bg-error-subtle px-3 py-1.5 text-nano font-semibold text-error transition-colors hover:bg-error/20"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
