import { useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { RF_INTERACTIVE } from '../../../../constants/canvas';

export interface NodeErrorBlockProps {
  message: string;
  /** `rich`: scrollable pre + copy (section / hypothesis). `plain`: scrollable div only (incubator). */
  variant?: 'rich' | 'plain';
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function NodeErrorBlock({ message, variant = 'rich' }: NodeErrorBlockProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (variant === 'plain') {
    return (
      <div className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
        {message}
      </div>
    );
  }

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(message);
    setCopyState(ok ? 'copied' : 'failed');
    if (ok) {
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  return (
    <div className="mb-2 rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
      <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-sans leading-snug text-inherit [font-size:inherit]">
        {message}
      </pre>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => void handleCopy()}
        className={`${RF_INTERACTIVE} mt-1 flex items-center gap-1 rounded px-0.5 py-0.5 text-nano font-medium text-error hover:bg-error-surface hover:text-error`}
        aria-live="polite"
      >
        <ClipboardCopy size={10} className="shrink-0 opacity-90" aria-hidden />
        {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy message'}
      </button>
    </div>
  );
}
