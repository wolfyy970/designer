import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { DesignTokensModal } from './DesignTokensModal';
import PromptEditor from './PromptEditor';
import type { PromptKey } from '../../stores/prompt-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEvaluatorDefaultsStore } from '../../stores/evaluator-defaults-store';
import {
  EVALUATOR_MAX_REVISION_ROUNDS_MAX,
  EVALUATOR_MAX_REVISION_ROUNDS_MIN,
  EVALUATOR_MAX_SCORE,
  EVALUATOR_MIN_SCORE,
} from '../../types/evaluator-settings';
import { EVALUATOR_RUBRIC_IDS, type EvaluatorRubricId } from '../../types/evaluation';

const RUBRIC_LABELS: Record<EvaluatorRubricId, string> = {
  design: 'Design quality',
  strategy: 'Strategy fidelity',
  implementation: 'Implementation',
  browser: 'Browser / preflight',
};

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** When the modal opens, switch to this tab once per open cycle */
  initialTab?: 'general' | 'prompts' | 'evaluator';
  /** Prompt Studio key (used with prompts tab) */
  initialPromptKey?: PromptKey;
}

type Tab = 'general' | 'prompts' | 'evaluator';

export default function SettingsModal({
  open,
  onClose,
  initialTab,
  initialPromptKey,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [designTokensOpen, setDesignTokensOpen] = useState(false);
  const autoLayout = useCanvasStore((s) => s.autoLayout);
  const toggleAutoLayout = useCanvasStore((s) => s.toggleAutoLayout);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current && initialTab) setTab(initialTab);
    wasOpenRef.current = open;
  }, [open, initialTab]);

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      size={tab === 'prompts' ? 'xl' : 'md'}
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
          Evaluator
        </button>
        <button
          type="button"
          onClick={() => setTab('prompts')}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'prompts'
              ? 'border-fg text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg-secondary'
          }`}
        >
          Prompts
        </button>
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
            <label className="flex cursor-pointer items-start gap-2.5 select-none">
              <input
                type="checkbox"
                checked={autoLayout}
                onChange={toggleAutoLayout}
                className="accent-accent mt-0.5 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-fg">Auto layout</span>
                <span className="mt-0.5 block text-xs text-fg-secondary">
                  When on, nodes follow the graph layout automatically and are not draggable.
                  Updates after compile, generate, and connection changes.
                </span>
              </span>
            </label>
          </div>
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

      {tab === 'prompts' && <PromptEditor initialPromptKey={initialPromptKey} />}
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

      <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
        <span className="block text-sm font-medium text-fg">Rubric weights</span>
        <p className="mt-1 text-xs text-fg-secondary">
          Relative importance of each rubric when computing the overall score (0–5 scale). Values need not sum to
          1—they are renormalized automatically. Defaults: 40% design, 30% strategy, 20% implementation, 10%
          browser.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {EVALUATOR_RUBRIC_IDS.map((rid) => (
            <label key={rid} className="flex flex-col gap-0.5">
              <span className="text-nano text-fg-secondary">{RUBRIC_LABELS[rid]}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={rubricWeights[rid]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setRubricWeights({ [rid]: Math.max(0, v) });
                }}
                className="rounded-md border border-border bg-bg px-2 py-2 text-xs text-fg-secondary input-focus"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-nano text-fg-secondary">
          Values you enter are renormalized so the four weights always sum to 1 for scoring.
        </p>
      </div>
    </div>
  );
}
