import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { RF_INTERACTIVE } from '../../constants/canvas';
import { STORAGE_KEYS, CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED_VALUE } from '../../lib/storage-keys';

const TIP_BAR_CLASS_NAME =
  'pointer-events-auto absolute bottom-3 left-3 right-3 z-20 flex items-start gap-3 rounded-lg border border-border bg-surface-floating px-3 py-2.5 shadow-lg backdrop-blur-md sm:left-1/2 sm:right-auto sm:max-w-xl sm:-translate-x-1/2';

function TipDismissButton(props: { onClick: () => void; 'aria-label': string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`${RF_INTERACTIVE} shrink-0 rounded p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg`}
      aria-label={props['aria-label']}
    >
      <X size={16} aria-hidden />
    </button>
  );
}

export default function OptionalInputsTip() {
  const [mainDismissed, setMainDismissed] = useState(() => {
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED) ===
        CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED_VALUE
      );
    } catch {
      return false;
    }
  });

  const dismissMain = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED,
        CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED_VALUE,
      );
    } catch {
      /* ignore quota / private mode */
    }
    setMainDismissed(true);
  }, []);

  if (mainDismissed) return null;

  return (
    <div className={TIP_BAR_CLASS_NAME} role="status">
      <p className="min-w-0 flex-1 text-xs leading-snug text-fg-secondary">
        The dashed cards are <span className="font-medium text-accent">optional inputs</span>. You can run
        with just your brief, model, and incubator — adding research, objectives, visuals, or
        constraints usually improves what the model produces.
      </p>
      <TipDismissButton onClick={dismissMain} aria-label="Dismiss tip" />
    </div>
  );
}
