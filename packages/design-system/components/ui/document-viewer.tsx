import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type DocumentViewerProps = HTMLAttributes<HTMLDivElement> & {
  content?: string;
  emptyMessage?: string;
  metadata?: ReactNode;
};

/**
 * Read-only document viewer for generated Markdown/plain-text artifacts.
 */
const DocumentViewer = forwardRef<HTMLDivElement, DocumentViewerProps>(
  (
    {
      className,
      content,
      emptyMessage = 'No document has been generated yet.',
      metadata,
      ...props
    },
    ref,
  ) => (
    <div ref={ref} className={cn('space-y-3', className)} {...props}>
      {metadata ? (
        <div className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-nano text-fg-muted">
          {metadata}
        </div>
      ) : null}
      <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface px-3 py-3 font-sans text-xs leading-relaxed text-fg-secondary">
        {content?.trim() ? content : emptyMessage}
      </pre>
    </div>
  ),
);
DocumentViewer.displayName = 'DocumentViewer';

export { DocumentViewer };
