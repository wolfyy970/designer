import { DsHelpTooltip } from '../../shared/DsHelpTooltip';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import {
  EVALUATOR_MAX_REVISION_ROUNDS_MAX,
  EVALUATOR_MAX_REVISION_ROUNDS_MIN,
  EVALUATOR_MAX_SCORE,
  EVALUATOR_MIN_SCORE,
} from '../../../types/evaluator-settings';

type Props = {
  nodeId: string;
  revisionEnabled: boolean;
  onRevisionEnabledChange: (enabled: boolean) => void;
  displayMaxRounds: number;
  onMaxRoundsChange: (value: number) => void;
  targetScoreChecked: boolean;
  effectiveMinScore: number | null | undefined;
  onTargetScoreToggle: (checked: boolean) => void;
  onMinScoreChange: (value: number) => void;
};

export function HypothesisAutoImproveSettings({
  nodeId,
  revisionEnabled,
  onRevisionEnabledChange,
  displayMaxRounds,
  onMaxRoundsChange,
  targetScoreChecked,
  effectiveMinScore,
  onTargetScoreToggle,
  onMinScoreChange,
}: Props) {
  return (
    <div className={`${RF_INTERACTIVE} mb-2 space-y-1.5`}>
      <div className="rounded-md border border-border-subtle bg-surface/40 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={revisionEnabled}
              onChange={(e) => onRevisionEnabledChange(e.target.checked)}
              className="accent-accent shrink-0"
            />
            <span className="text-nano font-medium text-fg-secondary">Auto-improve</span>
          </label>
          <DsHelpTooltip
            aria-label="What Auto-improve does"
            content={
              <>
                <span className="font-medium text-fg-secondary">Off:</span> one design pass, no quality loop.{' '}
                <span className="font-medium text-fg-secondary">On:</span> score the work, then the agent can refine
                it—bounded by max rounds and an optional score target below.
              </>
            }
          />
        </div>
        {revisionEnabled ? (
          <div className="mt-2 space-y-2 pl-7">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-nano text-fg-muted" htmlFor={`${nodeId}-max-rounds`}>
                Max rounds
              </label>
              <input
                id={`${nodeId}-max-rounds`}
                type="number"
                min={EVALUATOR_MAX_REVISION_ROUNDS_MIN}
                max={EVALUATOR_MAX_REVISION_ROUNDS_MAX}
                value={displayMaxRounds}
                onChange={(e) => onMaxRoundsChange(Number(e.target.value))}
                className="w-12 rounded border border-border bg-surface-raised px-1.5 py-0.5 text-center text-nano tabular-nums text-fg-secondary input-focus"
              />
            </div>
            <div className="space-y-1">
              <label className="flex cursor-pointer items-start gap-2 select-none">
                <input
                  type="checkbox"
                  checked={targetScoreChecked}
                  onChange={(e) => onTargetScoreToggle(e.target.checked)}
                  className="accent-accent mt-0.5 shrink-0"
                />
                <span className="text-nano text-fg-secondary">
                  Target quality score (early stop when reached)
                </span>
              </label>
              {targetScoreChecked ? (
                <input
                  type="number"
                  min={EVALUATOR_MIN_SCORE}
                  max={EVALUATOR_MAX_SCORE}
                  step={0.1}
                  value={effectiveMinScore ?? EVALUATOR_MIN_SCORE}
                  onChange={(e) => onMinScoreChange(Number(e.target.value))}
                  className="ml-6 w-20 rounded border border-border bg-bg px-1.5 py-1 text-nano text-fg-secondary input-focus"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
