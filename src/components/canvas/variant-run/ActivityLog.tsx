import { useEffect, useRef, useMemo } from 'react';

/** Lightweight markdown-to-HTML for model output (bold, lists, headings, code). */
function renderMarkdown(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/^### (.+)$/gm, '<h4 class="mt-2 mb-0.5 text-[10px] font-semibold text-fg-secondary">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="mt-2 mb-0.5 text-[11px] font-semibold text-fg-secondary">$1</h3>')
    .replace(/^# (.+)$/gm, '<h3 class="mt-2 mb-0.5 text-[11px] font-bold text-fg">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-fg-secondary">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-surface-secondary px-0.5 text-[9px]">$1</code>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-3 list-decimal text-[10px] leading-snug text-fg-muted">$1</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-3 list-disc text-[10px] leading-snug text-fg-muted">$1</li>')
    .replace(/\n/g, '<br/>');
}

/** Scrolling activity log — renders model output as markdown. */
export function ActivityLog({ entries }: { entries?: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = entries && entries.length > 0 ? entries.join('') : '';

  useEffect(() => {
    if (!text) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  const html = useMemo(() => (text ? renderMarkdown(text) : ''), [text]);

  if (!entries || entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-between p-3">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-border/40" />
          <div className="h-2.5 w-full animate-pulse rounded bg-border/30" style={{ animationDelay: '75ms' }} />
          <div className="h-2.5 w-[90%] animate-pulse rounded bg-border/30" style={{ animationDelay: '150ms' }} />
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-border/30" style={{ animationDelay: '225ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="nodrag nowheel min-h-0 flex-1 overflow-y-auto px-3 py-1.5 text-[10px] leading-snug text-fg-muted"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
