import type { RunTraceEvent } from '../../types/provider';
import { RF_INTERACTIVE } from '../../constants/canvas';
import { runTraceDetailToneClass } from '../../lib/run-trace-observability-styles';

/** Collapsible tool args / result for Run Trace and variant inspector timelines. */
export function ToolTraceObservabilityBlocks({
  trace,
  className = '',
}: {
  trace: RunTraceEvent;
  className?: string;
}) {
  const resultText = trace.detail ?? trace.toolResult;
  if (!trace.toolArgs && !resultText) return null;
  const preBase =
    'mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-nested/50 px-2 py-1.5 font-mono text-nano leading-snug';

  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      {trace.toolArgs ? (
        <details className={`${RF_INTERACTIVE} group`}>
          <summary
            className="cursor-pointer list-none text-nano font-medium text-fg-secondary marker:content-none [&::-webkit-details-marker]:hidden"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="underline decoration-border underline-offset-2 group-open:decoration-accent">
              Arguments (JSON)
            </span>
          </summary>
          <pre className={preBase + ' text-fg-muted'}>{trace.toolArgs}</pre>
        </details>
      ) : null}
      {resultText ? (
        <details className={`${RF_INTERACTIVE} group`} open={false}>
          <summary
            className="cursor-pointer list-none text-nano font-medium text-fg-secondary marker:content-none [&::-webkit-details-marker]:hidden"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="underline decoration-border underline-offset-2 group-open:decoration-accent">
              Result preview
            </span>
          </summary>
          <pre className={`${preBase} ${runTraceDetailToneClass(resultText)}`}>{resultText}</pre>
        </details>
      ) : null}
    </div>
  );
}
