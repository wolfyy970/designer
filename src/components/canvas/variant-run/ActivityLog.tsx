import { useEffect, useRef } from 'react';

/** Scrolling terminal-like activity log during generation */
export function ActivityLog({ entries }: { entries?: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = entries && entries.length > 0 ? entries.join('') : '';

  useEffect(() => {
    if (!text) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!entries || entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-between p-4">
        <div className="flex flex-col gap-2.5">
          <div className="h-4 w-4/5 animate-pulse rounded bg-border/50" />
          <div className="h-3 w-full animate-pulse rounded bg-border/40" style={{ animationDelay: '75ms' }} />
          <div className="h-3 w-[90%] animate-pulse rounded bg-border/40" style={{ animationDelay: '150ms' }} />
          <div className="h-3 w-3/4 animate-pulse rounded bg-border/40" style={{ animationDelay: '225ms' }} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-3 w-[85%] animate-pulse rounded bg-border/30" style={{ animationDelay: '300ms' }} />
          <div className="h-3 w-full animate-pulse rounded bg-border/30" style={{ animationDelay: '375ms' }} />
          <div className="h-3 w-2/3 animate-pulse rounded bg-border/30" style={{ animationDelay: '450ms' }} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-3 w-[70%] animate-pulse rounded bg-border/20" style={{ animationDelay: '525ms' }} />
          <div className="h-3 w-[90%] animate-pulse rounded bg-border/20" style={{ animationDelay: '600ms' }} />
          <div className="h-3 w-4/5 animate-pulse rounded bg-border/20" style={{ animationDelay: '675ms' }} />
          <div className="h-3 w-3/5 animate-pulse rounded bg-border/20" style={{ animationDelay: '750ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="nodrag nowheel min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[10px] leading-snug text-fg-muted"
    >
      <span className="whitespace-pre-wrap italic">{text}</span>
    </div>
  );
}
