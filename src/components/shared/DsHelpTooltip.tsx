import { useId, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

export type DsHelpTooltipProps = {
  /** Short help copy; keep to a sentence or two. */
  content: ReactNode;
  /** Passed to the trigger for screen readers. */
  'aria-label'?: string;
};

/**
 * Canvas-safe, design-token tooltip: help icon + hover/focus panel.
 * Use inside nodes with **`nodrag nowheel`** on the wrapper; trigger is a real `button`.
 *
 * Prefer this over raw `title=` for product UI so copy matches `@theme` surfaces and type scale.
 */
export function DsHelpTooltip({
  content,
  'aria-label': ariaLabel = 'More information',
}: DsHelpTooltipProps) {
  const tipId = useId();

  return (
    <span className="nodrag nowheel group/dstip relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        aria-describedby={tipId}
        aria-label={ariaLabel}
      >
        <CircleHelp className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-[500] mt-1 w-[min(100vw-2rem,13.5rem)] -translate-x-1/2 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-left text-nano leading-snug text-fg-secondary shadow-md opacity-0 transition-opacity duration-150 group-hover/dstip:visible group-hover/dstip:opacity-100 group-focus-within/dstip:visible group-focus-within/dstip:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
