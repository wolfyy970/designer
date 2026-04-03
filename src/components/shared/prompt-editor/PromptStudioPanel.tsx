import {
  RotateCcw,
  AlertTriangle,
  Save,
  Undo2,
  Columns2,
  GitCompare,
} from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PromptMeta } from '../../../stores/prompt-store';
import type { DiffLine } from '../../../lib/prompt-diff';
import type { Diagnostic } from './validate-prompt';

interface HistoryRow {
  version: number;
  createdAt: string;
}

interface PromptStudioPanelProps {
  saveAck: { version: number; label: string } | null;
  meta: PromptMeta;
  studioView: 'split' | 'unified';
  onStudioViewChange: (v: 'split' | 'unified') => void;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onResetToDefault: () => void;
  saveMutation: UseMutationResult<unknown, Error, string, unknown>;
  isModified: boolean;
  compareKind: 'default' | 'version';
  onCompareKindChange: (v: 'default' | 'version') => void;
  savedVersion: number | undefined;
  variables: string[] | undefined;
  displayValue: string;
  onDraftChange: (value: string) => void;
  referenceText: string;
  compareKindVersion: boolean;
  compareVersion: number | null;
  onCompareVersionChange: (v: number) => void;
  history: HistoryRow[];
  versionLoading: boolean;
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
  onDiscard,
  onResetToDefault,
  saveMutation,
  isModified,
  compareKind,
  onCompareKindChange,
  savedVersion,
  variables,
  displayValue,
  onDraftChange,
  referenceText,
  compareKindVersion,
  compareVersion,
  onCompareVersionChange,
  history,
  versionLoading,
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
          <p className="mt-0.5 text-xs text-fg-secondary">{meta.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-md border border-border p-0.5">
            <button
              type="button"
              title="Side-by-side"
              onClick={() => onStudioViewChange('split')}
              className={`rounded px-2 py-1 ${studioView === 'split' ? 'bg-surface-raised text-fg' : 'text-fg-muted'}`}
            >
              <Columns2 size={14} />
            </button>
            <button
              type="button"
              title="Unified diff"
              onClick={() => onStudioViewChange('unified')}
              className={`rounded px-2 py-1 ${studioView === 'unified' ? 'bg-surface-raised text-fg' : 'text-fg-muted'}`}
            >
              <GitCompare size={14} />
            </button>
          </div>
          {dirty && (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 rounded-md bg-fg px-2.5 py-1 text-micro font-medium text-bg hover:bg-fg/90 disabled:opacity-50"
              >
                <Save size={12} />
                Save
              </button>
              <button
                type="button"
                onClick={onDiscard}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-micro text-fg-secondary hover:bg-surface"
              >
                <Undo2 size={12} />
                Discard
              </button>
            </>
          )}
          {isModified && (
            <button
              type="button"
              onClick={onResetToDefault}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-micro text-fg-secondary hover:bg-surface"
            >
              <RotateCcw size={10} />
              Reset to baseline
            </button>
          )}
        </div>
      </div>

      {saveAck && (
        <div
          role="status"
          className="mb-2 rounded-md border border-success/40 bg-success/12 px-3 py-2 text-sm text-fg-secondary"
        >
          <span className="font-medium text-success">New version saved.</span>{' '}
          <span className="text-fg-secondary">
            “{saveAck.label}” is now <strong className="text-fg">v{saveAck.version}</strong> in the database.
          </span>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-micro text-fg-muted">
        <span className="text-nano uppercase text-fg-faint">Compare to</span>
        <select
          value={compareKind}
          onChange={(e) => {
            const v = e.target.value as 'default' | 'version';
            onCompareKindChange(v);
          }}
          className="rounded border border-border bg-surface px-2 py-1 text-nano text-fg-secondary"
        >
          <option value="default">Database baseline (lowest version)</option>
          <option value="version">Saved version…</option>
        </select>
        {savedVersion != null && (
          <span className="rounded bg-surface-raised px-1.5 py-0.5 text-nano">
            Saved v{savedVersion}
            {saveMutation.isPending ? ' · saving…' : ''}
          </span>
        )}
      </div>

      {variables && variables.length > 0 && (
        <div className="mb-2 rounded-md bg-surface px-3 py-2">
          <p className="mb-1 text-nano font-medium uppercase tracking-wide text-fg-muted">
            Template Variables
          </p>
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
            className="min-h-[200px] flex-1 resize-none rounded-md border border-border px-3 py-2 font-mono text-xs leading-relaxed text-fg-secondary input-focus"
          />
        </div>

        {studioView === 'split' ? (
          <div className="flex min-w-0 flex-1 flex-col border-l border-border-subtle pl-2">
            <p className="mb-1 text-nano font-medium text-fg-muted">Reference</p>
            {compareKindVersion && (
              <div className="mb-2 max-h-24 overflow-y-auto rounded border border-border-subtle bg-surface p-1">
                {history.length === 0 ? (
                  <p className="text-nano text-fg-muted">No history.</p>
                ) : (
                  history.map((h) => (
                    <button
                      key={h.version}
                      type="button"
                      onClick={() => onCompareVersionChange(h.version)}
                      className={`mb-0.5 w-full rounded px-2 py-1 text-left text-nano ${
                        compareVersion === h.version
                          ? 'bg-fg text-bg'
                          : 'text-fg-secondary hover:bg-surface-raised'
                      }`}
                    >
                      v{h.version}{' '}
                      <span className="text-fg-muted">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {compareKindVersion && versionLoading && (
              <p className="text-nano text-fg-muted">Loading version…</p>
            )}
            <textarea
              readOnly
              value={referenceText}
              spellCheck={false}
              className="min-h-[200px] flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg-muted"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-border-subtle pl-2">
            <p className="mb-1 text-nano font-medium text-fg-muted">Diff (reference → draft)</p>
            {compareKindVersion && (
              <div className="mb-2 flex flex-wrap gap-1">
                {history.map((h) => (
                  <button
                    key={h.version}
                    type="button"
                    onClick={() => onCompareVersionChange(h.version)}
                    className={`rounded border px-2 py-0.5 text-nano ${
                      compareVersion === h.version
                        ? 'border-fg bg-fg text-bg'
                        : 'border-border-subtle text-fg-secondary'
                    }`}
                  >
                    v{h.version}
                  </button>
                ))}
              </div>
            )}
            <div className="min-h-[200px] flex-1 overflow-auto rounded-md border border-border bg-surface font-mono text-xs leading-relaxed">
              {diffLines.map((ln, i) => (
                <div
                  key={i}
                  className={
                    ln.type === 'add'
                      ? 'bg-success/15 text-fg-secondary'
                      : ln.type === 'remove'
                        ? 'bg-error/15 text-fg-secondary line-through'
                        : 'text-fg-muted'
                  }
                >
                  <span className="inline-block w-8 shrink-0 select-none text-center text-nano text-fg-faint">
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
        {isModified && (
          <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-nano font-medium text-warning">
            Modified vs database baseline
          </span>
        )}
      </div>
    </div>
  );
}
