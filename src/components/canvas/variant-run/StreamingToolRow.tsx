import { formatStreamArgSize } from '../../../lib/format-stream-arg-size';

type Props = {
  toolName: string;
  toolPath?: string | null;
  streamedChars: number;
  /** Outer wrapper (layout + typography). */
  className: string;
};

const DEFAULT_DOT =
  'inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-accent';
const TIMELINE_DOT =
  'inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent';

/**
 * Shared “Streaming `tool` → path (size)” row for footer, hypothesis node, and timeline.
 */
export function StreamingToolRow({
  toolName,
  toolPath,
  streamedChars,
  className,
}: Props) {
  const path = toolPath != null && toolPath.length > 0 ? toolPath : null;
  return (
    <span className={className}>
      <span className={DEFAULT_DOT} aria-hidden />
      <span className="min-w-0">
        Streaming <code className="text-fg-secondary">{toolName}</code>
        {path != null ? (
          <>
            {' '}
            → <span className="text-fg-muted">{path}</span>
          </>
        ) : null}
        <span className="text-fg-muted">
          {' '}
          ({formatStreamArgSize(streamedChars)})
        </span>
      </span>
    </span>
  );
}

export { TIMELINE_DOT };
