import { ClipboardCopy } from 'lucide-react';
import { RF_INTERACTIVE } from '../../../../constants/canvas';

export interface NodeErrorBlockProps {
  message: string;
  /** `rich`: scrollable pre + copy (section / hypothesis). `plain`: scrollable div only (incubator). */
  variant?: 'rich' | 'plain';
}

export function NodeErrorBlock({ message, variant = 'rich' }: NodeErrorBlockProps) {
  if (variant === 'plain') {
    return (
      <div className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
        {message}
      </div>
    );
  }

  return (
    <div className="mb-2 rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
      <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-sans leading-snug text-inherit [font-size:inherit]">
        {message}
      </pre>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => void navigator.clipboard?.writeText(message)}
        className={`${RF_INTERACTIVE} mt-1 flex items-center gap-1 rounded px-0.5 py-0.5 text-nano font-medium text-error hover:bg-error-surface hover:text-error`}
      >
        <ClipboardCopy size={10} className="shrink-0 opacity-90" aria-hidden />
        Copy message
      </button>
    </div>
  );
}
