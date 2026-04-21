import { RF_INTERACTIVE } from '../../../constants/canvas';
import type { AggregatedEvaluationReport, EvaluationRoundSnapshot } from '../../../types/evaluation';
import { BrowserQASection } from './BrowserQASection';
import { EvalPrioritizedFixList } from './EvalPrioritizedFixList';
import { SCORECARD_PASS_THRESHOLD, scoreToBarPercent, thresholdTone } from './scorecard-threshold';

function DimensionBar({ label, score }: { label: string; score: number }) {
  const tone = thresholdTone(score);
  const fill = tone === 'success' ? 'bg-success' : 'bg-warning';
  const text = tone === 'success' ? 'text-success' : 'text-warning';
  return (
    <div className="grid grid-cols-[70px_1fr_28px] items-center gap-2 py-[2px]">
      <span className="truncate text-nano text-fg-secondary" title={label}>{label}</span>
      <span className="h-1.5 overflow-hidden rounded-sm bg-border-subtle">
        <span
          className={`block h-full ${fill}`}
          style={{ width: `${scoreToBarPercent(score)}%` }}
        />
      </span>
      <span className={`text-right font-mono text-nano tabular-nums ${text}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

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
  const rootCompact = `${RF_INTERACTIVE} shrink-0 overflow-y-auto border-t border-border-subtle bg-surface/50 px-3 py-2 max-h-[var(--max-height-eval-scorecard)]`;
  const rootPanel = 'nodrag shrink-0 bg-transparent px-0 py-0';

  const nonBrowserFails = summary.hardFails.filter((hf) => hf.source !== 'browser');
  const dimensionEntries = Object.entries(summary.normalizedScores ?? {}).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v),
  );

  return (
    <div className={`${mode === 'compact' ? rootCompact : rootPanel} ${className}`.trim()}>
      {showAggregateHeader ? (
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-badge uppercase tracking-wider text-fg-faint">
            Eval · {summary.shouldRevise ? 'revise suggested' : 'pass'}
          </span>
          <span className={`tabular-nums font-mono text-micro ${summary.overallScore >= SCORECARD_PASS_THRESHOLD ? 'text-success' : 'text-warning'}`}>
            {summary.overallScore.toFixed(1)}
          </span>
        </div>
      ) : null}

      {dimensionEntries.length > 0 ? (
        <div className="mb-1.5">
          {dimensionEntries.map(([label, score]) => (
            <DimensionBar key={label} label={label} score={score} />
          ))}
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
