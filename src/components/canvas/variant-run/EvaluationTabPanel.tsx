import { Loader2 } from 'lucide-react';
import type {
  AgenticPhase,
  AggregatedEvaluationReport,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../../../types/evaluation';
import {
  EVALUATOR_RUBRIC_IDS,
  EVALUATOR_WORKER_COUNT,
  isEvaluatorWorkerDegraded,
} from '../../../types/evaluation';
import { EvaluationScorecard } from './EvaluationScorecard.tsx';

const RUBRIC_TAB_LABEL: Record<EvaluatorRubricId, string> = {
  design: 'Design',
  strategy: 'Strategy',
  implementation: 'Implementation',
  browser: 'Browser',
};

function averageRubricScore(report: EvaluatorWorkerReport): number | null {
  const vals = Object.values(report.scores).map((s) => s.score);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const LIVE_EVAL_FAIL_DETAIL_MAX = 120;

function liveWorkerFailureSnippet(rep: EvaluatorWorkerReport): string {
  const d = rep.findings[0]?.detail?.trim();
  if (d) return d.length > LIVE_EVAL_FAIL_DETAIL_MAX ? `${d.slice(0, LIVE_EVAL_FAIL_DETAIL_MAX)}…` : d;
  const m = rep.hardFails[0]?.message?.trim();
  if (m) return m.length > LIVE_EVAL_FAIL_DETAIL_MAX ? `${m.slice(0, LIVE_EVAL_FAIL_DETAIL_MAX)}…` : m;
  return 'Evaluator worker failed';
}

function LiveEvalProgressCard(props: {
  liveEvalWorkers: Partial<Record<EvaluatorRubricId, EvaluatorWorkerReport>> | undefined;
  evalWorkersDoneCount: number;
}) {
  const { liveEvalWorkers, evalWorkersDoneCount } = props;
  return (
    <div className="border-b border-border-subtle p-3">
      <article className="overflow-hidden rounded-lg border border-border-subtle bg-surface-nested/25">
        <header className="flex items-center gap-2 border-b border-border-subtle bg-surface-nested/50 px-3 py-2">
          <span
            className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
            aria-hidden
          />
          <div className="text-nano font-semibold uppercase tracking-wide text-fg-secondary">
            Evaluating
          </div>
          <span className="tabular-nums text-badge text-fg-faint">
            {evalWorkersDoneCount}/{EVALUATOR_WORKER_COUNT} rubrics
          </span>
        </header>
        <ul className="divide-y divide-border-subtle/60 px-0">
          {EVALUATOR_RUBRIC_IDS.map((rubric) => {
            const rep = liveEvalWorkers?.[rubric];
            const degraded = rep ? isEvaluatorWorkerDegraded(rep) : false;
            return (
              <li key={rubric} className="flex flex-col gap-1 px-3 py-2 text-badge">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg-secondary">{RUBRIC_TAB_LABEL[rubric]}</span>
                  {rep ? (
                    <span className="flex items-center gap-2 tabular-nums text-fg-muted">
                      <span className="font-mono text-accent">
                        {(averageRubricScore(rep) ?? 0).toFixed(1)}
                      </span>
                      {degraded ? (
                        <span className="text-error">Worker failed</span>
                      ) : rep.hardFails.length > 0 ? (
                        <span className="text-warning">Hard fails</span>
                      ) : (
                        <span className="text-fg-faint">Done</span>
                      )}
                    </span>
                  ) : (
                    <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                  )}
                </div>
                {rep && degraded ? (
                  <p className="line-clamp-2 text-nano leading-snug text-error">{liveWorkerFailureSnippet(rep)}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </article>
    </div>
  );
}

export function EvaluationTabPanel(props: {
  isGenerating: boolean;
  agenticPhase?: AgenticPhase;
  liveEvalWorkers: Partial<Record<EvaluatorRubricId, EvaluatorWorkerReport>> | undefined;
  evalWorkersDoneCount: number;
  rounds: EvaluationRoundSnapshot[];
  lastRoundNum: number | undefined;
  evalSummary: AggregatedEvaluationReport | undefined;
  selectedRound: EvaluationRoundSnapshot | undefined;
}) {
  const {
    isGenerating,
    agenticPhase,
    liveEvalWorkers,
    evalWorkersDoneCount,
    rounds,
    lastRoundNum,
    evalSummary,
    selectedRound,
  } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {isGenerating && agenticPhase === 'evaluating' && (
          <LiveEvalProgressCard
            liveEvalWorkers={liveEvalWorkers}
            evalWorkersDoneCount={evalWorkersDoneCount}
          />
        )}
        {rounds.length > 0 ? (
          <div className="flex flex-col gap-3 p-3">
            {rounds.map((round) => {
              const isLatest = lastRoundNum != null && round.round === lastRoundNum;
              return (
                <article
                  key={round.round}
                  className="overflow-hidden rounded-lg border border-border-subtle bg-surface-nested/25"
                >
                  <header className="flex items-start justify-between gap-2 border-b border-border-subtle bg-surface-nested/50 px-3 py-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-nano font-semibold uppercase tracking-wide text-fg-secondary">
                        Round {round.round}
                        {isLatest ? (
                          <span className="ml-1.5 font-normal normal-case text-fg-faint">
                            · latest
                          </span>
                        ) : null}
                      </div>
                      <div className="text-badge text-fg-muted">
                        {round.aggregate.shouldRevise ? 'Revise suggested' : 'Pass'}
                      </div>
                    </div>
                    <span className="shrink-0 tabular-nums font-mono text-sm text-accent">
                      {round.aggregate.overallScore.toFixed(1)}
                    </span>
                  </header>
                  <div className="px-3 pb-3 pt-1">
                    <EvaluationScorecard
                      summary={round.aggregate}
                      latestSnapshot={round}
                      mode="panel"
                      showAggregateHeader={false}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : evalSummary ? (
          <div className="p-3">
            <article className="overflow-hidden rounded-lg border border-border-subtle bg-surface-nested/25">
              <header className="flex items-start justify-between gap-2 border-b border-border-subtle bg-surface-nested/50 px-3 py-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-nano font-semibold uppercase tracking-wide text-fg-secondary">
                    Evaluation
                  </div>
                  <div className="text-badge text-fg-muted">
                    {evalSummary.shouldRevise ? 'Revise suggested' : 'Pass'}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-mono text-sm text-accent">
                  {evalSummary.overallScore.toFixed(1)}
                </span>
              </header>
              <div className="px-3 pb-3 pt-1">
                <EvaluationScorecard
                  summary={evalSummary}
                  latestSnapshot={selectedRound}
                  mode="panel"
                  showAggregateHeader={false}
                />
              </div>
            </article>
          </div>
        ) : (
          <p className="px-3 py-3 text-nano text-fg-muted">
            {isGenerating
              ? 'Evaluation runs after the build phase; completed rounds will stack here.'
              : 'No evaluation data for this run.'}
          </p>
        )}
      </div>
    </div>
  );
}
