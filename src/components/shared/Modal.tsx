import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl' | '2xl';
  /** Overlay + panel stacking (e.g. z-[60] above another modal). */
  zIndexClass?: string;
  /** Panel max height; inner area scrolls. */
  maxHeightClass?: string;
}

const SIZE_CLASSES = {
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-6xl',
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  zIndexClass = 'z-50',
  maxHeightClass = 'max-h-[var(--max-height-modal)]',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center`}>
      <div
        className="absolute inset-0 bg-overlay"
        onClick={onClose}
      />
      <div
        className={`relative z-10 mx-4 flex ${maxHeightClass} w-full min-h-0 flex-col overflow-hidden rounded-xl bg-surface-raised shadow-xl ${SIZE_CLASSES[size]}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-raised px-5 py-3">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg-secondary"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
