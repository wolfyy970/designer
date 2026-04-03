import type { AggregatedEvaluationReport, EvaluationRoundSnapshot } from '../../../types/evaluation';
import { BrowserQASection } from './BrowserQASection';
import { EvalPrioritizedFixList } from './EvalPrioritizedFixList';

export function EvaluationScorecard({
  summary,
  latestSnapshot,
  className = '',
  mode = 'compact',
  showAggregateHeader = true,
}: {
  summary: AggregatedEvaluationReport;
  latestSnapshot?: EvaluationRoundSnapshot;
  mode?: 'compact' | 'panel';
  /** When false, omit the “Eval · pass” row (e.g. round card already has a header). */
  showAggregateHeader?: boolean;
  className?: string;
}) {
  const rootCompact =
    'nodrag nowheel shrink-0 overflow-y-auto border-t border-border-subtle bg-surface-secondary/50 px-3 py-2 max-h-[180px]';
  const rootPanel = 'nodrag shrink-0 bg-transparent px-0 py-0';

  const nonBrowserFails = summary.hardFails.filter((hf) => hf.source !== 'browser');

  return (
    <div className={`${mode === 'compact' ? rootCompact : rootPanel} ${className}`.trim()}>
      {showAggregateHeader ? (
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
            Eval · {summary.shouldRevise ? 'revise suggested' : 'pass'}
          </span>
          <span className="tabular-nums font-mono text-micro text-accent">
            {summary.overallScore.toFixed(1)}
          </span>
        </div>
      ) : null}

      {mode === 'compact' && nonBrowserFails.length > 0 ? (
        <div className="mb-1 text-nano text-fg-secondary">
          {nonBrowserFails.length} design/strategy fail(s)
        </div>
      ) : null}

      <EvalPrioritizedFixList fixes={summary.prioritizedFixes} mode={mode} />

      {latestSnapshot?.browser ? (
        <BrowserQASection
          snapshot={latestSnapshot}
          className={
            mode === 'panel'
              ? 'mt-3 border-t border-border-subtle pt-2 pb-1 shrink-0'
              : undefined
          }
          screenshotClassName={mode === 'panel' ? 'max-h-40' : undefined}
        />
      ) : null}
    </div>
  );
}
