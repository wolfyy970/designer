import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@ds/components/ui/button';

export interface PermanentDeleteConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const DESCRIPTION_ID = 'permanent-delete-description';

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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
  }, [open]);

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
        aria-describedby={DESCRIPTION_ID}
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
        <div
          id={DESCRIPTION_ID}
          className="px-4 py-3 text-nano leading-relaxed text-fg-secondary"
        >
          {description}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button
            ref={cancelRef}
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
