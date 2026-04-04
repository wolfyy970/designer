import { useCallback, useEffect, useRef, useState } from 'react';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import type { GenerationResult } from '../../../types/provider';
import Modal from '../../shared/Modal';
import {
  type DesignDebugExportOptions,
  type DesignDebugExportPreset,
  type DesignRunDebugExportInput,
  buildDesignDebugExportOptionsFromPreset,
  getDefaultDesignDebugExportOptions,
  mergeDesignDebugExportOptions,
} from '../../../lib/debug-markdown-export';

function exportHasAssistantText(r: GenerationResult): boolean {
  const byTurn = r.activityByTurn;
  if (byTurn && Object.keys(byTurn).length > 0) return true;
  const log = r.activityLog;
  return !!(log?.length && log.some((s) => s.trim().length > 0));
}

function ExportCheckboxRow({
  id,
  label,
  description,
  checked,
  disabled,
  indeterminate,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 ${disabled ? 'pointer-events-none opacity-45' : ''}`}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="nodrag mt-0.5 shrink-0 rounded border-border"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-micro leading-snug text-fg-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

type ArtifactMode = 'omit' | 'sizes' | 'full';

function getArtifactMode(o: DesignDebugExportOptions): ArtifactMode {
  if (o.artifactFullSources) return 'full';
  if (o.artifactManifest) return 'sizes';
  return 'omit';
}

function PresetButton({
  label,
  hint,
  active,
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={`nodrag flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent-surface text-fg'
          : 'border-border-subtle bg-surface text-fg-secondary hover:border-border hover:bg-surface-hover'
      }`}
    >
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-nano leading-snug text-fg-muted">{hint}</span>
    </button>
  );
}

function ArtifactChoice({
  mode,
  disabled,
  onChange,
}: {
  mode: ArtifactMode;
  disabled: boolean;
  onChange: (m: ArtifactMode) => void;
}) {
  const choice = (m: ArtifactMode, title: string, body: string) => {
    const selected = mode === m;
    return (
      <label
        className={`flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 ${disabled ? 'pointer-events-none opacity-45' : ''} ${
          selected ? 'border-accent bg-accent-tonal-weak' : 'border-border-subtle bg-surface hover:border-border'
        }`}
      >
        <input
          type="radio"
          name="artifact-mode"
          className="nodrag mt-1 shrink-0"
          checked={selected}
          disabled={disabled}
          onChange={() => onChange(m)}
        />
        <span>
          <span className="block text-sm font-medium text-fg">{title}</span>
          <span className="mt-0.5 block text-micro text-fg-muted">{body}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-2" role="radiogroup" aria-label="Generated design in export">
      {choice('omit', 'Skip generated design', 'No file list or source in the Markdown file.')}
      {choice(
        'sizes',
        'File names and sizes only',
        'A small table of paths and byte counts. No HTML or source code.',
      )}
      {choice(
        'full',
        'Include all source / HTML',
        'Full contents of every file, or the whole HTML document. Makes a large export.',
      )}
    </div>
  );
}

export interface DesignDebugExportDialogProps {
  open: boolean;
  onClose: () => void;
  variantLabel: string;
  previewInput: DesignRunDebugExportInput;
  onConfirm: (options: DesignDebugExportOptions) => void | Promise<void>;
}

export function DesignDebugExportDialog({
  open,
  onClose,
  variantLabel,
  previewInput,
  onConfirm,
}: DesignDebugExportDialogProps) {
  const [options, setOptions] = useState<DesignDebugExportOptions>(() =>
    getDefaultDesignDebugExportOptions(previewInput),
  );
  const [activePreset, setActivePreset] = useState<DesignDebugExportPreset | 'custom'>('balanced');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOptions(getDefaultDesignDebugExportOptions(previewInput));
    setActivePreset('balanced');
    setBusy(false);
  }, [open, previewInput]);

  const r = previewInput.result;
  const hasThinking = (r.thinkingTurns?.length ?? 0) > 0;
  const hasAssistant = exportHasAssistantText(r);
  const hasTrace = (r.liveTrace?.length ?? 0) > 0;
  const p = previewInput.provenance;
  const hasEval =
    (r.evaluationRounds?.length ?? 0) > 0 ||
    r.evaluationSummary != null ||
    !!(p?.evaluation?.rounds?.length);
  const hasArtifacts =
    !!(previewInput.files && Object.keys(previewInput.files).length > 0) ||
    !!previewInput.code?.trim();

  const patch = useCallback(
    (partial: Partial<DesignDebugExportOptions>) => {
      setOptions((prev) => mergeDesignDebugExportOptions(prev, partial));
      setActivePreset('custom');
    },
    [],
  );

  const applyPreset = useCallback((preset: DesignDebugExportPreset) => {
    setOptions(buildDesignDebugExportOptionsFromPreset(previewInput, preset));
    setActivePreset(preset);
  }, [previewInput]);

  const runContextOn =
    options.runSummary && options.strategySnapshot && options.progressHarness;
  const setRunContext = (v: boolean) => {
    patch({
      runSummary: v,
      strategySnapshot: v,
      progressHarness: v,
    });
  };

  const savedCoreAll =
    options.provenanceHypothesisSnapshot &&
    options.provenanceDesignSystem &&
    options.provenanceRequestMeta &&
    options.provenanceCheckpoint;
  const savedCoreSome =
    options.provenanceHypothesisSnapshot ||
    options.provenanceDesignSystem ||
    options.provenanceRequestMeta ||
    options.provenanceCheckpoint;
  const setSavedCore = (v: boolean) => {
    if (v) {
      patch({
        provenanceHypothesisSnapshot: true,
        provenanceDesignSystem: true,
        provenanceRequestMeta: true,
        provenanceCheckpoint: true,
      });
    } else {
      patch({
        provenanceHypothesisSnapshot: false,
        provenanceDesignSystem: false,
        provenanceCompiledPrompt: false,
        provenanceRequestMeta: false,
        provenanceCheckpoint: false,
      });
    }
  };

  const setArtifactMode = (mode: ArtifactMode) => {
    if (mode === 'omit') patch({ artifactManifest: false, artifactFullSources: false });
    else if (mode === 'sizes') patch({ artifactManifest: true, artifactFullSources: false });
    else patch({ artifactManifest: true, artifactFullSources: true });
  };

  const handleReset = () => {
    setOptions(getDefaultDesignDebugExportOptions(previewInput));
    setActivePreset('balanced');
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(options);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Export debug — ${variantLabel}`}
      size="lg"
    >
      <div className="flex max-h-[var(--max-height-debug-export)] flex-col overflow-hidden">
        <p className="mb-3 shrink-0 text-xs text-fg-secondary">
          Download a Markdown file you can share or archive. Pick a preset, then tweak what goes in. Anything marked
          “large” can make the file huge.
        </p>

        <div className="mb-4 shrink-0 space-y-2">
          <p className="text-nano font-semibold uppercase tracking-wider text-fg-faint">Start from</p>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <PresetButton
              label="Light"
              hint="Identifiers, strategy text, scores; light saved context. No streams or source."
              active={activePreset === 'quick'}
              onClick={() => applyPreset('quick')}
              disabled={busy}
            />
            <PresetButton
              label="Recommended"
              hint="Adds thinking, trace, and richer saved context when available."
              active={activePreset === 'balanced'}
              onClick={() => applyPreset('balanced')}
              disabled={busy}
            />
            <PresetButton
              label="Everything"
              hint="Transcript, full merged prompt, and all source. Expect a big file."
              active={activePreset === 'full'}
              onClick={() => applyPreset('full')}
              disabled={busy}
            />
          </div>
        </div>

        <div className={`${RF_INTERACTIVE} min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]`}>
          <div className="space-y-5 pb-1">
            <section>
              <h3 className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-faint">Include in the file</h3>
              <div className="space-y-2">
                <ExportCheckboxRow
                  id="exp-run-bundle"
                  label="Run details and strategy"
                  description="Status, model, IDs, hypothesis text, and agent progress (tasks, file plan)."
                  checked={runContextOn}
                  onChange={setRunContext}
                />
                <ExportCheckboxRow
                  id="exp-thinking"
                  label="Thinking stream"
                  description="Extended reasoning from the model, when available."
                  checked={options.thinking}
                  disabled={!hasThinking}
                  onChange={(v) => patch({ thinking: v })}
                />
                <ExportCheckboxRow
                  id="exp-assistant"
                  label="Full model reply (large)"
                  description="Everything the assistant streamed into chat. Often the biggest section."
                  checked={options.assistantOutput}
                  disabled={!hasAssistant}
                  onChange={(v) => patch({ assistantOutput: v })}
                />
                <ExportCheckboxRow
                  id="exp-trace"
                  label="Structured activity log"
                  description="Step-by-step trace lines (tools, phases, etc.)."
                  checked={options.runTrace}
                  disabled={!hasTrace}
                  onChange={(v) => patch({ runTrace: v })}
                />
                <ExportCheckboxRow
                  id="exp-eval"
                  label="Evaluation and scores"
                  description="Rubric results and summaries from this run."
                  checked={options.evaluationFromResult}
                  disabled={!hasEval}
                  onChange={(v) => patch({ evaluationFromResult: v })}
                />
                <ExportCheckboxRow
                  id="exp-saved-core"
                  label="Saved request context"
                  description="From browser storage (loaded when you export): hypothesis, design-system text, provider line, checkpoint."
                  checked={savedCoreAll}
                  indeterminate={savedCoreSome && !savedCoreAll}
                  onChange={setSavedCore}
                />
                <div className="ml-6 space-y-2 border-l border-border-subtle pl-3">
                  <ExportCheckboxRow
                    id="exp-compiled"
                    label="Also include the full merged prompt (very large)"
                    description="The entire text sent to the model (spec, rules, etc.). Turn on only if you need an exact replay."
                    checked={options.provenanceCompiledPrompt}
                    disabled={!savedCoreSome}
                    onChange={(v) => patch({ provenanceCompiledPrompt: v })}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-faint">
                Generated design (what you preview in the iframe)
              </h3>
              <ArtifactChoice
                mode={getArtifactMode(options)}
                disabled={!hasArtifacts || busy}
                onChange={setArtifactMode}
              />
              {!hasArtifacts ? (
                <p className="mt-2 text-micro text-fg-muted">No HTML or multi-file output for this run — these choices are disabled.</p>
              ) : null}
            </section>

            <details className="rounded-lg border border-border-subtle bg-surface-nested/30 px-3 py-2 text-xs">
              <summary className="cursor-pointer select-none font-medium text-fg-secondary">Advanced — duplicate evaluation block</summary>
              <p className="mb-2 mt-2 text-micro text-fg-muted">
                Normally one evaluation section is enough. Turn this on only if you need the copy that was stored
                separately inside provenance.
              </p>
              <ExportCheckboxRow
                id="exp-prov-dup-eval"
                label="Second copy of evaluation from storage"
                checked={options.provenanceEvaluation}
                onChange={(v) => patch({ provenanceEvaluation: v })}
              />
            </details>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <button
            type="button"
            className="nodrag rounded-md px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-hover"
            disabled={busy}
            onClick={handleReset}
          >
            Use recommended defaults
          </button>
          <button
            type="button"
            className="nodrag rounded-md px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-hover"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nodrag rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? 'Exporting…' : 'Export Markdown'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
