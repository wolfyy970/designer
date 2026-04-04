import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronsDown } from 'lucide-react';

/** Floating control to re-enable scroll-follow during streaming. */
export function TimelineJumpToLatest({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={onClick}
      className="nodrag absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-subtle bg-surface-floating-strong px-3 py-1 text-nano font-medium text-fg-secondary shadow-md backdrop-blur-sm hover:bg-surface-raised hover:text-fg"
    >
      <ChevronsDown size={12} />
      Latest
    </button>
  );
}

/** Placeholder when no trace or activity yet. */
export function TimelineEmptyStateSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center p-4">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-4/5 animate-pulse rounded bg-border-pulse-mid" />
        <div
          className="h-2.5 w-full animate-pulse rounded bg-border-pulse-track"
          style={{ animationDelay: '75ms' }}
        />
        <div
          className="h-2.5 w-[90%] animate-pulse rounded bg-border-pulse-track"
          style={{ animationDelay: '150ms' }}
        />
        <div
          className="h-2.5 w-3/4 animate-pulse rounded bg-border-pulse-track"
          style={{ animationDelay: '225ms' }}
        />
      </div>
    </div>
  );
}

type AccordionChromeProps = {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  /** Right side of header row (durations, counts, streaming label). */
  trailing?: ReactNode;
  children?: ReactNode;
};

/** Shared chrome for Thinking / Tool use collapsible blocks. */
export function TimelineAccordionChrome({
  open,
  onToggle,
  icon,
  title,
  trailing,
  children,
}: AccordionChromeProps) {
  return (
    <div className="mb-2 border-l-2 border-border-subtle pl-2">
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={onToggle}
        className="nodrag flex w-full items-center gap-1.5 rounded px-0 py-0.5 text-left text-badge text-fg-muted transition-colors hover:bg-surface-nested/50 hover:text-fg-secondary"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-70" />
        )}
        {icon}
        <span className="font-medium">{title}</span>
        {trailing}
      </button>
      {children}
    </div>
  );
}
