import { RotateCcw, AlertTriangle, Save, Undo2, Columns2, GitCompare } from 'lucide-react';
import type { PromptMeta } from '../../../stores/prompt-store';
import type { DiffLine } from '../../../lib/prompt-diff';
import type { Diagnostic } from './validate-prompt';

interface PromptStudioPanelProps {
  saveAck: { label: string } | null;
  meta: PromptMeta;
  studioView: 'split' | 'unified';
  onStudioViewChange: (v: 'split' | 'unified') => void;
  dirty: boolean;
  onSave: () => void;
  onDiscardEdits: () => void;
  onClearLocalOverride: () => void;
  hasLocalOverride: boolean;
  savedVersion: number | undefined;
  variables: string[] | undefined;
  displayValue: string;
  onDraftChange: (value: string) => void;
  referenceText: string;
  diffLines: DiffLine[];
  diagnostics: Diagnostic[];
  charCount: number;
  approxTokens: number;
}

export function PromptStudioPanel({
  saveAck,
  meta,
  studioView,
  onStudioViewChange,
  dirty,
  onSave,
  onDiscardEdits,
  onClearLocalOverride,
  hasLocalOverride,
  savedVersion,
  variables,
  displayValue,
  onDraftChange,
  referenceText,
  diffLines,
  diagnostics,
  charCount,
  approxTokens,
}: PromptStudioPanelProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col pl-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-fg">{meta.label}</h3>
          <p className="caption mt-0.5">{meta.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex w-fit gap-0.5 rounded border border-border bg-surface p-0.5">
            <button
              type="button"
              title="Side-by-side"
              onClick={() => onStudioViewChange('split')}
              className={`rounded px-2.5 py-1 ${
                studioView === 'split'
                  ? 'bg-fg text-bg'
                  : 'text-xs text-fg-muted hover:text-fg-secondary'
              }`}
              aria-pressed={studioView === 'split'}
            >
              <Columns2 size={14} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title="Unified diff"
              onClick={() => onStudioViewChange('unified')}
              className={`rounded px-2.5 py-1 ${
                studioView === 'unified'
                  ? 'bg-fg text-bg'
                  : 'text-xs text-fg-muted hover:text-fg-secondary'
              }`}
              aria-pressed={studioView === 'unified'}
            >
              <GitCompare size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {dirty && (
            <>
              <button type="button" onClick={onSave} className="ds-btn-primary-muted">
                <Save size={12} strokeWidth={2} aria-hidden />
                Save
              </button>
              <button
                type="button"
                onClick={onDiscardEdits}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
              >
                <Undo2 size={12} strokeWidth={2} aria-hidden />
                Discard edits
              </button>
            </>
          )}
          {hasLocalOverride && (
            <button
              type="button"
              onClick={onClearLocalOverride}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            >
              <RotateCcw size={12} strokeWidth={2} aria-hidden />
              Clear local override
            </button>
          )}
        </div>
      </div>

      {saveAck && (
        <div
          role="status"
          className="mb-2 rounded-md border border-success-border-muted bg-success-surface px-3 py-2 text-micro text-fg-secondary"
        >
          <span className="font-medium text-success">Saved locally.</span>{' '}
          <span>
            “{saveAck.label}” will be sent as an override on compile / generate / extract requests from this
            browser.
          </span>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-nano font-medium uppercase tracking-wide text-fg-muted">Compare to</span>
        <span className="rounded border border-border bg-surface-nested px-2 py-1 text-nano text-fg-secondary">
          Database baseline (production)
        </span>
        {savedVersion != null && (
          <span className="rounded bg-surface-meta-chip px-1.5 py-0.5 text-nano text-fg-muted">
            Server v{savedVersion} (reference)
          </span>
        )}
      </div>

      {variables && variables.length > 0 && (
        <div className="mb-2 rounded-md border border-border-subtle bg-surface-nested px-3 py-2">
          <p className="label mb-1">Template variables</p>
          <div className="flex flex-wrap gap-1">
            {variables.map((v) => {
              const present = displayValue.includes(`{{${v}}}`);
              return (
                <code
                  key={v}
                  className={`rounded px-1.5 py-0.5 text-micro ${
                    present
                      ? 'bg-surface-raised text-fg-secondary'
                      : 'bg-warning-subtle text-warning line-through'
                  }`}
                >
                  {'{{'}
                  {v}
                  {'}}'}
                </code>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-1 text-nano font-medium text-fg-muted">Draft (editable)</p>
          <textarea
            value={displayValue}
            onChange={(e) => onDraftChange(e.target.value)}
            spellCheck={false}
            className="min-h-[var(--min-height-prompt-textarea)] flex-1 resize-none rounded-md border border-border px-3 py-2 font-mono text-xs leading-relaxed text-fg-secondary input-focus"
          />
        </div>

        {studioView === 'split' ? (
          <div className="flex min-w-0 flex-1 flex-col border-l border-border-subtle pl-2">
            <p className="mb-1 text-nano font-medium text-fg-muted">Reference</p>
            <textarea
              readOnly
              value={referenceText}
              spellCheck={false}
              className="min-h-[var(--min-height-prompt-textarea)] flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg-muted"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-border-subtle pl-2">
            <p className="mb-1 text-nano font-medium text-fg-muted">Diff (reference → draft)</p>
            <div className="min-h-[var(--min-height-prompt-textarea)] flex-1 overflow-auto rounded-md border border-border bg-surface font-mono text-xs leading-relaxed">
              {diffLines.map((ln, i) => (
                <div
                  key={i}
                  className={
                    ln.type === 'add'
                      ? 'bg-success-highlight text-fg-secondary'
                      : ln.type === 'remove'
                        ? 'bg-error-highlight text-fg-secondary line-through'
                        : 'text-fg-muted'
                  }
                >
                  <span className="inline-block min-w-[var(--width-prompt-diff-gutter)] shrink-0 select-none text-center text-nano text-fg-faint">
                    {ln.type === 'add' ? '+' : ln.type === 'remove' ? '−' : ' '}
                  </span>
                  <span>{ln.text || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {diagnostics.length > 0 && (
        <div className="mt-2 space-y-1">
          {diagnostics.map((d, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded bg-warning-subtle px-2 py-1 text-micro text-warning"
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-micro text-fg-muted">
        <span>{charCount.toLocaleString()} chars</span>
        <span>~{approxTokens.toLocaleString()} tokens</span>
        {dirty && (
          <span className="text-warning">
            Unsaved changes — click Save or use ⌘S / Ctrl+S
          </span>
        )}
        {hasLocalOverride && (
          <span className="inline-block rounded border border-accent bg-surface px-1.5 py-0.5 text-nano font-medium text-fg-secondary">
            Local override active
          </span>
        )}
      </div>
    </div>
  );
}
