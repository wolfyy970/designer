import type { RunTraceEvent } from '../../../types/provider';

export function LiveTraceList({ trace }: { trace?: RunTraceEvent[] }) {
  if (!trace?.length) {
    return <p className="px-3 py-2 text-[10px] text-fg-muted">No structured trace events yet.</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 font-mono text-[10px] text-fg-muted">
        {trace.map((t) => (
          <li key={t.id} className="leading-snug" title={t.label}>
            <span className="text-fg-faint">{t.kind}</span>{' '}
            <span className="text-fg-secondary">{t.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
