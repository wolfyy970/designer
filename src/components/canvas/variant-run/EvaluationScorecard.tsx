import type { AggregatedEvaluationReport, EvaluationRoundSnapshot } from '../../../types/evaluation';
import { BrowserQASection } from './BrowserQASection';

export function EvaluationScorecard({
  summary,
  latestSnapshot,
  className = 'max-h-[180px]',
}: {
  summary: AggregatedEvaluationReport;
  latestSnapshot?: EvaluationRoundSnapshot;
  /** Tailwind extras; default caps height for the variant card */
  className?: string;
}) {
  return (
    <div
      className={`nodrag nowheel shrink-0 overflow-y-auto border-t border-border-subtle bg-surface-secondary/50 px-3 py-2 ${className}`}
    >
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">
          Eval · {summary.shouldRevise ? 'revise suggested' : 'pass'}
        </span>
        <span className="tabular-nums font-mono text-[11px] text-accent">
          {summary.overallScore.toFixed(1)}
        </span>
      </div>
      {summary.hardFails.length > 0 && (
        <div className="text-[10px] text-error mb-1">
          {summary.hardFails.filter((hf) => hf.source !== 'browser').length > 0 && (
            <span>{summary.hardFails.filter((hf) => hf.source !== 'browser').length} design/strategy fail(s) · </span>
          )}
        </div>
      )}
      <ul className="list-disc pl-3 text-[10px] text-fg-muted space-y-0.5 leading-snug">
        {summary.prioritizedFixes
          .filter((f) => !f.startsWith('[hard_fail:missing_assets') && !f.startsWith('[hard_fail:js_') && !f.startsWith('[hard_fail:empty_'))
          .slice(0, 4)
          .map((f, i) => (
            <li key={i}>{f}</li>
          ))}
      </ul>
      {latestSnapshot?.browser && <BrowserQASection snapshot={latestSnapshot} />}
    </div>
  );
}
