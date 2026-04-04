import { Loader2 } from 'lucide-react';

interface GeneratingSkeletonProps {
  label?: string;
  elapsed?: number;
}

export default function GeneratingSkeleton({ label = 'Generating…', elapsed }: GeneratingSkeletonProps) {
  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-border-pulse-heavy" />
        <div className="h-3 w-full animate-pulse rounded bg-border-pulse-heavy" style={{ animationDelay: '75ms' }} />
        <div className="h-3 w-5/6 animate-pulse rounded bg-border-pulse-heavy" style={{ animationDelay: '150ms' }} />
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
          <Loader2 size={12} className="animate-spin text-accent" />
          {label}
        </span>
        {elapsed != null && (
          <span className="tabular-nums text-nano text-fg-muted">{elapsed}s</span>
        )}
      </div>
    </div>
  );
}
