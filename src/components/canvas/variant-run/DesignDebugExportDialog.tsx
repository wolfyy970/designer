import { useCallback, useEffect, useRef, useState } from 'react';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import type { GenerationResult } from '../../../types/provider';
import { Button } from '@ds/components/ui/button';
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
type DownloadMode = 'files' | 'debug' | 'full';

function getArtifactMode(o: DesignDebugExportOptions): ArtifactMode {
  if (o.artifactFullSources) return 'full';
  if (o.artifactManifest) return 'sizes';
  return 'omit';
}

function DownloadModeButton({
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
      className={`nodrag flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent-surface text-fg'
          : 'border-border-subtle bg-surface text-fg-secondary hover:border-border hover:bg-surface-hover'
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-micro leading-snug text-fg-muted">{hint}</span>
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

function PresetSummary({
  mode,
  activePreset,
  options,
  artifactMode,
}: {
  mode: DownloadMode;
  activePreset: DesignDebugExportPreset | 'custom';
  options: DesignDebugExportOptions;
  artifactMode: ArtifactMode;
}) {
  if (mode === 'files') {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-3 py-3">
        <p className="text-sm font-semibold text-fg">Design files</p>
        <p className="mt-0.5 text-micro leading-snug text-fg-muted">
          Downloads the generated artifact only: a ZIP for multi-file designs or a single HTML file.
        </p>
      </div>
    );
  }

  const presetLabel =
    activePreset === 'quick' ? 'Light' : activePreset === 'balanced' ? 'Recommended' : activePreset === 'full' ? 'Everything' : 'Custom';
  const included: string[] = [];
  if (options.runSummary && options.strategySnapshot && options.progressHarness) included.push('run details');
  if (options.thinking) included.push('thinking');
  if (options.runTrace) included.push('activity log');
  if (options.assistantOutput) included.push('full model reply');
  if (options.evaluationFromResult || options.provenanceEvaluation) included.push('evaluation');
  if (
    options.provenanceHypothesisSnapshot ||
    options.provenanceDesignSystem ||
    options.provenanceRequestMeta ||
    options.provenanceCheckpoint
  ) {
    included.push('saved context');
  }
  if (options.provenanceCompiledPrompt) included.push('merged prompt');
  if (artifactMode === 'sizes') included.push('file list');
  if (artifactMode === 'full') included.push('full source');

  const artifactLabel =
    artifactMode === 'omit'
      ? 'Generated files skipped'
      : artifactMode === 'sizes'
        ? 'Generated files listed by name and size'
        : 'Generated source included';

  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-fg">{presetLabel} export</p>
          <p className="mt-0.5 text-micro leading-snug text-fg-muted">
            {included.length > 0 ? `Includes ${included.join(', ')}.` : 'Includes only the minimum run identifiers.'}
          </p>
        </div>
        <span className="rounded-full border border-border-subtle bg-surface-raised px-2 py-1 text-nano font-medium text-fg-muted">
          {artifactLabel}
        </span>
      </div>
    </div>
  );
}

export interface DesignDebugExportDialogProps {
  open: boolean;
  onClose: () => void;
  variantLabel: string;
  previewInput: DesignRunDebugExportInput;
  onDownloadFiles: () => void | Promise<void>;
  onConfirm: (options: DesignDebugExportOptions) => void | Promise<void>;
}

export function DesignDebugExportDialog({
  open,
  onClose,
  variantLabel,
  previewInput,
  onDownloadFiles,
  onConfirm,
}: DesignDebugExportDialogProps) {
  const [options, setOptions] = useState<DesignDebugExportOptions>(() =>
    getDefaultDesignDebugExportOptions(previewInput),
  );
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('files');
  const [activePreset, setActivePreset] = useState<DesignDebugExportPreset | 'custom'>('balanced');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOptions(getDefaultDesignDebugExportOptions(previewInput));
    setDownloadMode('files');
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

  const chooseDownloadMode = useCallback(
    (mode: DownloadMode) => {
      setDownloadMode(mode);
      if (mode === 'debug') {
        applyPreset('balanced');
      } else if (mode === 'full') {
        applyPreset('full');
      }
    },
    [applyPreset],
  );

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
    setDownloadMode('files');
    setActivePreset('balanced');
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (downloadMode === 'files') {
        await onDownloadFiles();
      } else {
        await onConfirm(options);
      }
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel = busy
    ? downloadMode === 'files' ? 'Downloading...' : 'Exporting...'
    : downloadMode === 'files' ? 'Download Files' : 'Export Markdown';

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Download — ${variantLabel}`}
      size="lg"
      zIndexClass="z-[120]"
    >
      <div className="flex max-h-[var(--max-height-debug-export)] flex-col overflow-hidden">
        <p className="mb-3 shrink-0 text-xs text-fg-secondary">
          Choose whether to download only the generated design or include debugging context in a Markdown snapshot.
        </p>

        <div className="mb-4 shrink-0 space-y-2">
          <p className="text-nano font-semibold uppercase tracking-wider text-fg-faint">Download type</p>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <DownloadModeButton
              label="Design files"
              hint="Just the generated HTML, CSS, JavaScript, and assets."
              active={downloadMode === 'files'}
              onClick={() => chooseDownloadMode('files')}
              disabled={busy}
            />
            <DownloadModeButton
              label="Debug snapshot"
              hint="Markdown with the useful run context for diagnosis."
              active={downloadMode === 'debug'}
              onClick={() => chooseDownloadMode('debug')}
              disabled={busy}
            />
            <DownloadModeButton
              label="Everything"
              hint="Markdown with transcript, prompt, and source. Can be large."
              active={downloadMode === 'full'}
              onClick={() => chooseDownloadMode('full')}
              disabled={busy}
            />
          </div>
        </div>

        <div className={`${RF_INTERACTIVE} min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]`}>
          <div className="space-y-5 pb-1">
            <PresetSummary
              mode={downloadMode}
              activePreset={activePreset}
              options={options}
              artifactMode={getArtifactMode(options)}
            />

            {downloadMode !== 'files' ? (
              <details className="rounded-lg border border-border-subtle bg-surface-nested/30 px-3 py-2 text-xs">
                <summary className="cursor-pointer select-none font-medium text-fg-secondary">
                  Advanced: choose exact sections
                </summary>
                <div className="mt-3 space-y-5">
                  <section>
                    <h3 className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-faint">
                      Generated design
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

                <section>
                  <h3 className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-faint">Run context</h3>
                  <div className="space-y-2">
                    <ExportCheckboxRow
                      id="exp-run-bundle"
                      label="Run details and strategy"
                      description="Status, model, IDs, hypothesis text, and agent progress."
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
                      description="Everything the assistant streamed into chat."
                      checked={options.assistantOutput}
                      disabled={!hasAssistant}
                      onChange={(v) => patch({ assistantOutput: v })}
                    />
                    <ExportCheckboxRow
                      id="exp-trace"
                      label="Structured activity log"
                      description="Step-by-step trace lines, tools, and phases."
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
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-faint">Saved context</h3>
                  <div className="space-y-2">
                    <ExportCheckboxRow
                      id="exp-saved-core"
                      label="Saved request context"
                      description="Hypothesis, design-system text, provider line, and checkpoint."
                      checked={savedCoreAll}
                      indeterminate={savedCoreSome && !savedCoreAll}
                      onChange={setSavedCore}
                    />
                    <div className="ml-6 space-y-2 border-l border-border-subtle pl-3">
                      <ExportCheckboxRow
                        id="exp-compiled"
                        label="Full merged prompt (very large)"
                        description="The exact prompt text sent to the model."
                        checked={options.provenanceCompiledPrompt}
                        disabled={!savedCoreSome}
                        onChange={(v) => patch({ provenanceCompiledPrompt: v })}
                      />
                      <ExportCheckboxRow
                        id="exp-prov-dup-eval"
                        label="Duplicate evaluation from storage"
                        description="Usually unnecessary; kept for deep provenance checks."
                        checked={options.provenanceEvaluation}
                        onChange={(v) => patch({ provenanceEvaluation: v })}
                      />
                    </div>
                  </div>
                </section>
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="nodrag"
            disabled={busy}
            onClick={handleReset}
          >
            Reset choices
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="nodrag"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="nodrag"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
