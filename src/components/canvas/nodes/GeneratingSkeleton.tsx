import { Loader2 } from 'lucide-react';

interface GeneratingSkeletonProps {
  label?: string;
  /** Live status from SSE (e.g. compile stream). */
  detail?: string;
  elapsed?: number;
  /**
   * `default` — spinner + label + elapsed (e.g. placeholder nodes with no action button).
   * `contentOnly` — pulse bars + elapsed + optional detail; status/spinner lives on the control.
   */
  variant?: 'default' | 'contentOnly';
}

export default function GeneratingSkeleton({
  label = 'Generating…',
  detail,
  elapsed,
  variant = 'default',
}: GeneratingSkeletonProps) {
  const pulseBars = (
    <div className="flex flex-col gap-1.5">
      <div className="h-3 w-3/4 animate-pulse rounded bg-border-pulse-heavy" />
      <div className="h-3 w-full animate-pulse rounded bg-border-pulse-heavy" style={{ animationDelay: '75ms' }} />
      <div className="h-3 w-5/6 animate-pulse rounded bg-border-pulse-heavy" style={{ animationDelay: '150ms' }} />
    </div>
  );

  if (variant === 'contentOnly') {
    return (
      <div className="flex flex-col gap-3 px-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{pulseBars}</div>
          {elapsed != null ? (
            <span className="shrink-0 tabular-nums text-nano text-fg-muted">{elapsed}s</span>
          ) : null}
        </div>
        {detail ? (
          <p className="line-clamp-3 break-words text-nano leading-snug text-fg-muted" title={detail}>
            {detail}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      {pulseBars}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <Loader2 size={12} className="animate-spin text-accent" />
            {label}
          </span>
          {elapsed != null && (
            <span className="tabular-nums text-nano text-fg-muted">{elapsed}s</span>
          )}
        </div>
        {detail ? (
          <p className="line-clamp-3 break-words text-nano leading-snug text-fg-muted" title={detail}>
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
