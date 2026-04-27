import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Modal from './Modal';
import { DesignTokensModal } from './DesignTokensModal';
import { PartitionSlider } from './PartitionSlider';
import { floatWeightsToPercents, percentsToFloatWeights } from '../../lib/partition-slider-utils';
import { useEvaluatorDefaultsStore } from '../../stores/evaluator-defaults-store';
import { useThinkingDefaultsStore } from '../../stores/thinking-defaults-store';
import {
  EVALUATOR_MAX_REVISION_ROUNDS_MAX,
  EVALUATOR_MAX_REVISION_ROUNDS_MIN,
  EVALUATOR_MAX_SCORE,
  EVALUATOR_MIN_SCORE,
} from '../../types/evaluator-settings';
import { EVALUATOR_RUBRIC_IDS, type EvaluatorRubricId } from '../../types/evaluation';
import {
  THINKING_BUDGET_BY_LEVEL,
  THINKING_BUDGET_MAX_TOKENS,
  THINKING_BUDGET_MIN_TOKENS,
  THINKING_CONFIG_DEFAULTS,
  THINKING_LEVELS,
  THINKING_TASKS,
  type ThinkingLevel,
  type ThinkingTask,
} from '../../lib/thinking-defaults';

const THINKING_TASK_LABELS: Record<ThinkingTask, string> = {
  design: 'Design (agent build)',
  incubate: 'Incubator / hypothesis auto-generate',
  'internal-context': 'Design specification',
  inputs: 'Input auto-generate',
  'design-system': 'Design system extract',
  evaluator: 'Evaluator',
};

const RUBRIC_LABELS: Record<EvaluatorRubricId, string> = {
  design: 'Design quality',
  strategy: 'Strategy fidelity',
  implementation: 'Implementation',
  browser: 'Browser / preflight',
};

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'evaluator';
}

type Tab = 'general' | 'evaluator';

function RubricWeightsPartitionCard({
  rubricWeights,
  setRubricWeights,
}: {
  rubricWeights: Record<EvaluatorRubricId, number>;
  setRubricWeights: (patch: Partial<Record<EvaluatorRubricId, number>>) => void;
}) {
  const percents = useMemo(
    () => floatWeightsToPercents(rubricWeights, EVALUATOR_RUBRIC_IDS),
    [rubricWeights],
  );

  const onPartitionChange = useCallback(
    (p: Record<string, number>) => {
      const floats = percentsToFloatWeights(p, EVALUATOR_RUBRIC_IDS) as Record<EvaluatorRubricId, number>;
      setRubricWeights(floats);
    },
    [setRubricWeights],
  );

  const segments = useMemo(
    () =>
      EVALUATOR_RUBRIC_IDS.map((rid) => ({
        id: rid,
        label: RUBRIC_LABELS[rid],
      })),
    [],
  );

  return (
    <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
      <span className="block text-sm font-medium text-fg">Rubric weights</span>
      <p className="mt-1 text-xs text-fg-secondary">
        Relative importance of each rubric when computing the overall score (0–5 scale). Drag the dividers or click a
        percentage to type a value—percentages always sum to 100 and are stored as weights for scoring. Defaults: 40%
        design, 30% strategy, 20% implementation, 10% browser.
      </p>
      <PartitionSlider segments={segments} values={percents} onChange={onPartitionChange} />
      <p className="mt-2 text-nano text-fg-secondary">
        Keyboard: focus a divider, then Arrow Left/Right by 1% (Shift for 5%). Same weights are renormalized on the
        server if needed.
      </p>
    </div>
  );
}

export default function SettingsModal({
  open,
  onClose,
  initialTab,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [designTokensOpen, setDesignTokensOpen] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current && initialTab) {
      setTab(initialTab);
    }
    wasOpenRef.current = open;
  }, [open, initialTab]);

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      size="md"
    >
      <div className="-mx-5 -mt-4 mb-4 flex border-b border-border px-5">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'general'
              ? 'border-fg text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg-secondary'
          }`}
        >
          General
        </button>
        <button
          type="button"
          onClick={() => setTab('evaluator')}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'evaluator'
              ? 'border-fg text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg-secondary'
          }`}
        >
          Evaluator defaults
        </button>
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <ReasoningSection />
          {import.meta.env.DEV ? (
            <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
              <span className="block text-sm font-medium text-fg">Design system</span>
              <p className="mt-1 text-xs text-fg-secondary">
                Browse <code className="rounded bg-surface px-1 font-mono text-nano">@theme</code> swatches, typography
                scale, and <code className="rounded bg-surface px-1 font-mono text-nano">ds-*</code> patterns in a
                scrollable reference.
              </p>
              <button
                type="button"
                onClick={() => setDesignTokensOpen(true)}
                className="ds-btn-primary-muted mt-2 w-fit"
              >
                Open design tokens kitchen sink…
              </button>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'evaluator' && <EvaluatorSettingsTab />}
    </Modal>
    {import.meta.env.DEV ? (
      <DesignTokensModal open={designTokensOpen} onClose={() => setDesignTokensOpen(false)} />
    ) : null}
    </>
  );
}

function EvaluatorSettingsTab() {
  const maxRevisionRounds = useEvaluatorDefaultsStore((s) => s.maxRevisionRounds);
  const minOverallScore = useEvaluatorDefaultsStore((s) => s.minOverallScore);
  const rubricWeights = useEvaluatorDefaultsStore((s) => s.rubricWeights);
  const setMaxRevisionRounds = useEvaluatorDefaultsStore((s) => s.setMaxRevisionRounds);
  const setMinOverallScore = useEvaluatorDefaultsStore((s) => s.setMinOverallScore);
  const setRubricWeights = useEvaluatorDefaultsStore((s) => s.setRubricWeights);

  const scoreEnabled = minOverallScore != null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-secondary">
        These apply when <span className="font-medium text-fg">Auto-improve</span> is on (evaluator + optional revision
        loop). With Auto-improve off, the server does not run evaluators—only the design agent. Per-hypothesis overrides:
        max rounds and target score on the node. Rubric weights stay here (shared across hypotheses that use
        evaluation).
      </p>
      <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
        <span className="block text-sm font-medium text-fg">Maximum revision rounds</span>
        <p className="mt-1 text-xs text-fg-secondary">
          Hard cap on evaluator-driven revision passes after the first build + evaluation. A run ends when either
          this many rounds is used or an earlier success applies: with Target quality score on, that means the overall
          score meets your minimum and there are no hard fails; with it off, that means the revision gate clears (
          <code className="rounded bg-surface px-1 font-mono text-nano">shouldRevise: false</code>
          ).
        </p>
        <input
          type="number"
          min={EVALUATOR_MAX_REVISION_ROUNDS_MIN}
          max={EVALUATOR_MAX_REVISION_ROUNDS_MAX}
          value={maxRevisionRounds}
          onChange={(e) => setMaxRevisionRounds(Number(e.target.value))}
          className="mt-2 w-24 rounded-md border border-border bg-bg px-2 py-2 text-xs text-fg-secondary input-focus"
        />
      </div>

      <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2.5 select-none">
          <input
            type="checkbox"
            checked={scoreEnabled}
            onChange={(e) => {
              if (e.target.checked) setMinOverallScore(4);
              else setMinOverallScore(null);
            }}
            className="accent-accent mt-0.5 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium text-fg">Target quality score</span>
            <span className="mt-0.5 block text-xs text-fg-secondary">
              When enabled, stopping for success is based on this threshold (and no hard fails), not only on the
              revision gate. The run still ends at the maximum revision rounds if the score is not reached in time.
              Score range matches server eval (0–5).
            </span>
          </span>
        </label>
        {scoreEnabled ? (
          <div className="mt-2 pl-7">
            <input
              type="number"
              min={EVALUATOR_MIN_SCORE}
              max={EVALUATOR_MAX_SCORE}
              step={0.1}
              value={minOverallScore ?? EVALUATOR_MIN_SCORE}
              onChange={(e) => setMinOverallScore(Number(e.target.value))}
              className="w-28 rounded-md border border-border bg-bg px-2 py-2 text-xs text-fg-secondary input-focus"
            />
          </div>
        ) : null}
      </div>

      <RubricWeightsPartitionCard
        rubricWeights={rubricWeights}
        setRubricWeights={setRubricWeights}
      />
    </div>
  );
}

function ReasoningSection() {
  const overrides = useThinkingDefaultsStore((s) => s.overrides);
  const setLevel = useThinkingDefaultsStore((s) => s.setLevel);
  const setBudgetTokens = useThinkingDefaultsStore((s) => s.setBudgetTokens);
  const resetTask = useThinkingDefaultsStore((s) => s.resetTask);

  return (
    <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
      <span className="block text-sm font-medium text-fg">Reasoning (thinking)</span>
      <p className="mt-1 text-xs text-fg-secondary">
        Per-task reasoning effort + token budget for models that support extended thinking.
        Ignored on models without reasoning support (chip shows the ↓ arrow instead of the Brain icon).
      </p>
      <div className="mt-3 space-y-1.5">
        {THINKING_TASKS.map((task) => {
          const defaults = THINKING_CONFIG_DEFAULTS[task];
          const override = overrides[task] ?? {};
          const effectiveLevel = override.level ?? defaults.level;
          const budgetPlaceholder = THINKING_BUDGET_BY_LEVEL[effectiveLevel];
          const isCustomized = override.level !== undefined || override.budgetTokens !== undefined;
          return (
            <div key={task} className="flex items-center gap-2">
              <span className="min-w-[9rem] text-nano text-fg-secondary">
                {THINKING_TASK_LABELS[task]}
              </span>
              <select
                value={override.level ?? defaults.level}
                onChange={(e) => {
                  const v = e.target.value as ThinkingLevel;
                  setLevel(task, v === defaults.level ? undefined : v);
                }}
                className="rounded-md border border-border bg-bg px-2 py-1 text-nano text-fg-secondary input-focus"
                aria-label={`${THINKING_TASK_LABELS[task]} level`}
              >
                {THINKING_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={THINKING_BUDGET_MIN_TOKENS}
                max={THINKING_BUDGET_MAX_TOKENS}
                step={256}
                value={override.budgetTokens ?? ''}
                placeholder={String(budgetPlaceholder)}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '') setBudgetTokens(task, undefined);
                  else setBudgetTokens(task, Number(raw));
                }}
                className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-nano tabular-nums text-fg-secondary input-focus"
                aria-label={`${THINKING_TASK_LABELS[task]} budget in tokens`}
              />
              <span className="text-nano text-fg-faint">tok</span>
              <button
                type="button"
                onClick={() => resetTask(task)}
                disabled={!isCustomized}
                className="ml-auto text-nano text-fg-faint disabled:opacity-40 hover:text-fg-secondary"
              >
                Reset
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
