import { useState, useCallback, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { getLogs as apiGetLogs, clearLogs as apiClearLogs } from '../../api/client';
import { useObservabilityLogStore } from '../../stores/observability-log-store';
import Modal from '../shared/Modal';
import { useGenerationStore } from '../../stores/generation-store';
import { useCompilerStore, findStrategy } from '../../stores/compiler-store';
import type { RunTraceEvent } from '../../types/provider';
import { runTraceEventSchema } from '../../lib/run-trace-event-schema';
import type { PromptKey } from '../../stores/prompt-store';
import { ToolTraceObservabilityBlocks } from '../shared/ToolTraceObservabilityBlocks';

const LANGFUSE_UI_BASE =
  (import.meta.env.VITE_LANGFUSE_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:3100';

function parseRunTracePayload(ev: unknown): RunTraceEvent | null {
  const r = runTraceEventSchema.safeParse(ev);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.debug('[LogViewer] invalid trace payload', r.error);
    }
    return null;
  }
  return r.data as RunTraceEvent;
}

interface LogViewerProps {
  open: boolean;
  onClose: () => void;
  onOpenPromptStudio?: (key: PromptKey) => void;
}

const LOG_POLL_MS = 1000;

function TraceEntry({
  trace,
  title,
  runNumber,
}: {
  trace: RunTraceEvent;
  title: string;
  runNumber?: number;
}) {
  const time = new Date(trace.at).toLocaleTimeString();
  const tone =
    trace.status === 'error'
      ? 'text-error'
      : trace.status === 'warning'
        ? 'text-warning'
        : trace.status === 'success'
          ? 'text-success'
          : 'text-fg-secondary';

  const isToolLifecycle =
    trace.kind === 'tool_started' ||
    trace.kind === 'tool_finished' ||
    trace.kind === 'tool_failed';

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`text-xs font-semibold ${tone}`}>{trace.kind.replaceAll('_', ' ')}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-fg">{trace.label}</div>
          {!isToolLifecycle && trace.detail ? (
            <p className="mt-1 text-nano leading-snug whitespace-pre-wrap break-words text-fg-muted">
              {trace.detail}
            </p>
          ) : null}
          {isToolLifecycle ? <ToolTraceObservabilityBlocks trace={trace} className="mt-2" /> : null}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-nano text-fg-muted">
            <span>
              {title}
              {runNumber != null ? ` · v${runNumber}` : ''}
            </span>
            {trace.phase && <span>{trace.phase}</span>}
            {trace.toolName && <span>tool: {trace.toolName}</span>}
            {trace.path && <span>path: {trace.path}</span>}
            {trace.round != null && <span>round {trace.round}</span>}
          </div>
        </div>
        <span className="shrink-0 text-nano text-fg-faint">{time}</span>
      </div>
    </div>
  );
}

export default function LogViewer({ open, onClose, onOpenPromptStudio: _onOpenPromptStudio }: LogViewerProps) {
  void _onOpenPromptStudio;
  const snapshot = useObservabilityLogStore((s) => s.snapshot);
  const setObservabilitySnapshot = useObservabilityLogStore((s) => s.setSnapshot);
  const [tab, setTab] = useState<'langfuse' | 'trace'>('trace');
  const results = useGenerationStore((s) => s.results);
  const incubationPlans = useCompilerStore((s) => s.incubationPlans);

  useEffect(() => {
    if (!open) return;
    const load = () => {
      void apiGetLogs().then(setObservabilitySnapshot);
    };
    load();
    const id = window.setInterval(load, LOG_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, setObservabilitySnapshot]);

  const handleClear = useCallback(() => {
    void apiClearLogs().then(() => setObservabilitySnapshot({ llm: [], trace: [] }));
  }, [setObservabilitySnapshot]);

  const traceEntries = useMemo(() => {
    const rows: Array<{ trace: RunTraceEvent; title: string; runNumber?: number; rowKey: string }> =
      [];
    for (const row of snapshot.trace) {
      const trace = parseRunTracePayload(row.payload.event);
      if (!trace) continue;
      const result = row.payload.resultId
        ? results.find((r) => r.id === row.payload.resultId)
        : undefined;
      const strategy = result
        ? findStrategy(incubationPlans, result.strategyId)
        : undefined;
      rows.push({
        trace,
        title: strategy?.name ?? 'Run trace',
        runNumber: result?.runNumber,
        rowKey: `${row.ts}:${trace.id}`,
      });
    }
    return rows.sort((a, b) => Date.parse(b.trace.at) - Date.parse(a.trace.at));
  }, [snapshot.trace, results, incubationPlans]);

  return (
    <Modal open={open} onClose={onClose} title="Observability" size="xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setTab('langfuse')}
              className={`rounded px-2.5 py-1 text-xs ${tab === 'langfuse' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'}`}
            >
              Langfuse
            </button>
            <button
              type="button"
              onClick={() => setTab('trace')}
              className={`rounded px-2.5 py-1 text-xs ${tab === 'trace' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'}`}
            >
              Run Trace
            </button>
          </div>
          <div className="flex items-center gap-3">
            {tab === 'langfuse' ? (
              <p className="text-xs text-fg-muted">Traces and LLM generations</p>
            ) : (
              <p className="text-xs text-fg-muted">
                {traceEntries.length} trace event{traceEntries.length !== 1 ? 's' : ''} this session
                (API ring)
              </p>
            )}
            {(snapshot.trace.length > 0 || snapshot.llm.length > 0) && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-fg-muted hover:bg-error-subtle hover:text-error"
                type="button"
              >
                <Trash2 size={12} />
                Clear
              </button>
            )}
          </div>
        </div>

        {tab === 'langfuse' ? (
          <div className="space-y-3 rounded-lg border border-border-subtle bg-surface px-4 py-4 text-sm text-fg-secondary">
            <p>
              Full LLM call instrumentation, nested spans, and eval signals are exported to your{' '}
              <strong className="text-fg">Langfuse</strong> project (cloud or self-hosted). For the button below,
              set <code className="text-fg-secondary">VITE_LANGFUSE_BASE_URL</code> to the same host as{' '}
              <code className="text-fg-secondary">LANGFUSE_BASE_URL</code>.
            </p>
            <a
              href={LANGFUSE_UI_BASE}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md border border-border bg-fg px-3 py-2 text-xs font-medium text-bg hover:opacity-90"
            >
              Open Langfuse UI
            </a>
            <p className="text-nano text-fg-muted">
              Defaults to <code className="text-fg-secondary">http://localhost:3100</code> if unset (self-hosted);
              for Langfuse Cloud, set it explicitly (see <code className="text-fg-secondary">.env.example</code>).
            </p>
          </div>
        ) : (
          <>
            <p className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-nano leading-relaxed text-fg-muted">
              Run trace rows come from <strong className="text-fg-secondary">GET /api/logs</strong>{' '}
              (server ring + optional NDJSON in dev). Inline Variant Inspector still uses live client
              traces; this tab is the audit view.
            </p>
            {traceEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-12 text-center text-xs text-fg-muted">
                No run trace yet. Start an agentic run to inspect tool flow, file writes, and hand-offs.
              </div>
            ) : (
              <div className="space-y-2">
                {traceEntries.map(({ trace, title, runNumber, rowKey }) => (
                  <TraceEntry key={rowKey} trace={trace} title={title} runNumber={runNumber} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
