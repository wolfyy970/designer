import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Trash2, Copy, Check } from 'lucide-react';
import type { LlmLogEntry, ObservabilityLogsResponse } from '../../api/types';
import { getLogs as apiGetLogs, clearLogs as apiClearLogs } from '../../api/client';
import Modal from '../shared/Modal';
import { FEEDBACK_DISMISS_MS } from '../../lib/constants';
import { useGenerationStore } from '../../stores/generation-store';
import { useCompilerStore, findVariantStrategy } from '../../stores/compiler-store';
import type { RunTraceEvent } from '../../types/provider';
import { promptKeyFromLlmLogEntry } from '../../lib/prompt-log-mapping';
import type { PromptKey } from '../../stores/prompt-store';

const SOURCE_LABEL: Record<string, string> = {
  compiler: 'Incubator',
  planner: 'Planner',
  builder: 'Builder',
  designSystem: 'Design system',
  evaluator: 'Evaluator',
  agentCompaction: 'Agent compaction',
  other: 'Other',
};

const SOURCE_COLOR: Record<string, string> = {
  compiler: 'text-accent',
  planner: 'text-[#a78bfa]',
  builder: 'text-success',
  designSystem: 'text-[#f59e0b]',
  evaluator: 'text-[#22c55e]',
  agentCompaction: 'text-[#38bdf8]',
  other: 'text-fg-muted',
};

function coerceRunTraceEvent(ev: Record<string, unknown>): RunTraceEvent | null {
  if (
    typeof ev.id !== 'string' ||
    typeof ev.at !== 'string' ||
    typeof ev.kind !== 'string' ||
    typeof ev.label !== 'string'
  ) {
    return null;
  }
  return ev as unknown as RunTraceEvent;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), FEEDBACK_DISMISS_MS);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded p-1 text-fg-faint hover:bg-surface hover:text-fg-muted"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function PromptBlock({ label, content }: { label: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 200);
  const isLong = content.length > 200;

  return (
    <div className="rounded border border-border-subtle bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-nano font-medium text-fg-secondary hover:bg-surface-raised"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
        <span className="ml-auto text-fg-faint">{content.length.toLocaleString()} chars</span>
        <CopyButton text={content} />
      </button>
      {expanded ? (
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words border-t border-border-subtle px-3 py-2 font-mono text-nano leading-relaxed text-fg-secondary">
          {content}
        </pre>
      ) : isLong ? (
        <div className="border-t border-border-subtle px-3 py-2 font-mono text-nano text-fg-muted">
          {preview}…
        </div>
      ) : (
        <div className="border-t border-border-subtle px-3 py-2 font-mono text-nano text-fg-secondary">
          {content}
        </div>
      )}
    </div>
  );
}

function tokenSummary(entry: LlmLogEntry): string | null {
  if (entry.totalTokens != null) {
    return `${entry.totalTokens.toLocaleString()} tok`;
  }
  if (entry.promptTokens != null || entry.completionTokens != null) {
    const p = entry.promptTokens?.toLocaleString() ?? '—';
    const c = entry.completionTokens?.toLocaleString() ?? '—';
    return `${p}→${c} tok`;
  }
  return null;
}

function tokensPerSecond(entry: LlmLogEntry): string | null {
  const total = entry.totalTokens;
  if (total == null || entry.durationMs <= 0 || entry.status === 'in_progress') return null;
  const tps = (total / entry.durationMs) * 1000;
  if (!Number.isFinite(tps)) return null;
  return `${tps >= 100 ? Math.round(tps) : tps.toFixed(1)} tok/s`;
}

function LogEntry({
  entry,
  onOpenPromptStudio,
}: {
  entry: LlmLogEntry;
  onOpenPromptStudio?: (key: PromptKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const studioKey = useMemo(() => promptKeyFromLlmLogEntry(entry), [entry]);
  const [elapsedLiveSec, setElapsedLiveSec] = useState(0);
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const inProgress = entry.status === 'in_progress';
  useEffect(() => {
    if (!inProgress) return;
    const started = Date.parse(entry.timestamp);
    const tick = () =>
      setElapsedLiveSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [inProgress, entry.timestamp]);
  const durationSec = inProgress
    ? `${elapsedLiveSec}s`
    : (entry.durationMs / 1000).toFixed(1);
  const tok = tokenSummary(entry);
  const tps = tokensPerSecond(entry);

  return (
    <div className="rounded-lg border border-border bg-surface-raised">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
      >
        {open ? <ChevronDown size={14} className="text-fg-muted" /> : <ChevronRight size={14} className="text-fg-muted" />}

        <span className={`text-xs font-semibold ${SOURCE_COLOR[entry.source] ?? 'text-fg-muted'}`}>
          {SOURCE_LABEL[entry.source] ?? entry.source}
        </span>

        {entry.phase && (
          <span className="text-nano text-fg-muted">{entry.phase}</span>
        )}

        <span
          className="min-w-0 max-w-[12rem] truncate text-nano text-fg-muted md:max-w-[16rem]"
          title={`${entry.providerName ?? entry.provider} · ${entry.model}`}
        >
          {entry.providerName ?? entry.provider} · {entry.model}
        </span>

        <span className="ml-auto flex items-center gap-3">
          {inProgress && (
            <span className="rounded bg-accent-subtle px-1.5 py-0.5 text-nano text-accent" title="Request started; row updates until the provider responds">
              Live
            </span>
          )}
          {entry.error && (
            <span className="rounded bg-error-subtle px-1.5 py-0.5 text-nano text-error">Error</span>
          )}
          {entry.toolCalls && entry.toolCalls.length > 0 && (
            <span className="text-nano text-fg-muted">
              {entry.toolCalls.length} tool{entry.toolCalls.length > 1 ? 's' : ''}
            </span>
          )}
          {entry.truncated && (
            <span className="rounded bg-warning-subtle px-1 py-0.5 text-nano text-warning" title="finish_reason length">
              Truncated
            </span>
          )}
          {tok && (
            <span className="tabular-nums text-nano text-fg-muted" title="Token usage from provider">
              {tok}
              {tps ? ` · ${tps}` : ''}
            </span>
          )}
          <span
            className="tabular-nums text-nano text-fg-muted"
            title={
              inProgress
                ? 'Elapsed since this call started (server session log; poll ~1s)'
                : 'Total duration for this call'
            }
          >
            {durationSec}
            {!inProgress ? 's' : ''}
          </span>
          <span className="text-nano text-fg-faint">{time}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div className="flex flex-wrap gap-2 text-nano text-fg-muted">
            <span>
              Model: <strong className="text-fg-secondary">{entry.model}</strong>
            </span>
            <span>
              Provider:{' '}
              <strong className="text-fg-secondary">
                {entry.providerName ?? entry.provider}
              </strong>
              {entry.providerName ? (
                <span className="text-fg-faint"> ({entry.provider})</span>
              ) : null}
            </span>
            {entry.correlationId && (
              <span className="w-full font-mono text-fg-faint" title="Correlation id for this generate / hypothesis run">
                Run: {entry.correlationId}
              </span>
            )}
            {(entry.promptTokens != null ||
              entry.completionTokens != null ||
              entry.totalTokens != null ||
              entry.reasoningTokens != null ||
              entry.cachedPromptTokens != null ||
              entry.costCredits != null) && (
              <span className="w-full text-fg-secondary">
                {entry.promptTokens != null && <>in: {entry.promptTokens.toLocaleString()} </>}
                {entry.completionTokens != null && <>out: {entry.completionTokens.toLocaleString()} </>}
                {entry.totalTokens != null && <>Σ: {entry.totalTokens.toLocaleString()} </>}
                {entry.cachedPromptTokens != null && (
                  <>cached in: {entry.cachedPromptTokens.toLocaleString()} </>
                )}
                {entry.reasoningTokens != null && (
                  <>reasoning: {entry.reasoningTokens.toLocaleString()} </>
                )}
                {entry.costCredits != null && <>cost: {entry.costCredits}</>}
              </span>
            )}
          </div>

          {entry.error && (
            <div className="rounded bg-error-subtle px-3 py-2 text-nano text-error">
              {entry.error}
            </div>
          )}

          {studioKey && onOpenPromptStudio && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onOpenPromptStudio(studioKey)}
                className="rounded border border-border-subtle bg-surface px-2 py-1 text-nano text-fg-secondary hover:bg-surface-raised"
              >
                Edit prompt in Studio
              </button>
            </div>
          )}

          {entry.toolCalls && entry.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.toolCalls.map((tc, i) => (
                <span key={i} className="rounded bg-surface px-2 py-0.5 text-nano text-fg-secondary">
                  {tc.name}{tc.path ? `: ${tc.path}` : ''}
                </span>
              ))}
            </div>
          )}

          <PromptBlock label="System Prompt" content={entry.systemPrompt} />
          <PromptBlock label="User Prompt" content={entry.userPrompt} />
          <PromptBlock label="Model Response" content={entry.response} />
        </div>
      )}
    </div>
  );
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

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`text-xs font-semibold ${tone}`}>{trace.kind.replaceAll('_', ' ')}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-fg">{trace.label}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-nano text-fg-muted">
            <span>{title}{runNumber != null ? ` · v${runNumber}` : ''}</span>
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

export default function LogViewer({ open, onClose, onOpenPromptStudio }: LogViewerProps) {
  const [snapshot, setSnapshot] = useState<ObservabilityLogsResponse>({ llm: [], trace: [] });
  const [tab, setTab] = useState<'calls' | 'trace'>('calls');
  const results = useGenerationStore((s) => s.results);
  const dimensionMaps = useCompilerStore((s) => s.dimensionMaps);

  useEffect(() => {
    if (!open) return;
    const load = () => {
      void apiGetLogs().then(setSnapshot);
    };
    load();
    const id = window.setInterval(load, LOG_POLL_MS);
    return () => window.clearInterval(id);
  }, [open]);

  const handleClear = useCallback(() => {
    void apiClearLogs().then(() => setSnapshot({ llm: [], trace: [] }));
  }, []);

  const entries = snapshot.llm;
  const reversed = [...entries].reverse();
  const traceEntries = useMemo(() => {
    const rows: Array<{ trace: RunTraceEvent; title: string; runNumber?: number; rowKey: string }> =
      [];
    for (const row of snapshot.trace) {
      const trace = coerceRunTraceEvent(row.payload.event);
      if (!trace) continue;
      const result = row.payload.resultId
        ? results.find((r) => r.id === row.payload.resultId)
        : undefined;
      const strategy = result
        ? findVariantStrategy(dimensionMaps, result.variantStrategyId)
        : undefined;
      rows.push({
        trace,
        title: strategy?.name ?? 'Run trace',
        runNumber: result?.runNumber,
        rowKey: `${row.ts}:${trace.id}`,
      });
    }
    return rows.sort((a, b) => Date.parse(b.trace.at) - Date.parse(a.trace.at));
  }, [snapshot.trace, results, dimensionMaps]);

  return (
    <Modal open={open} onClose={onClose} title="Observability" size="xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
            <button
              onClick={() => setTab('calls')}
              className={`rounded px-2.5 py-1 text-xs ${tab === 'calls' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'}`}
            >
              LLM Calls
            </button>
            <button
              onClick={() => setTab('trace')}
              className={`rounded px-2.5 py-1 text-xs ${tab === 'trace' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'}`}
            >
              Run Trace
            </button>
          </div>
          <div className="flex items-center gap-3">
            {tab === 'calls' ? (
              <p className="text-xs text-fg-muted">
                {entries.length} call{entries.length !== 1 ? 's' : ''} this session (API ring)
              </p>
            ) : (
              <p className="text-xs text-fg-muted">
                {traceEntries.length} trace event{traceEntries.length !== 1 ? 's' : ''} this session
                (API ring)
              </p>
            )}
            {(entries.length > 0 || snapshot.trace.length > 0) && (
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

        {tab === 'calls' ? (
          reversed.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-xs text-fg-muted">
              No LLM calls logged yet. Run the Incubator or generate a design to see logs here.
            </div>
          ) : (
            <div className="space-y-2">
              {reversed.map((entry) => (
                <LogEntry
                  key={entry.id}
                  entry={entry}
                  onOpenPromptStudio={onOpenPromptStudio}
                />
              ))}
            </div>
          )
        ) : (
          <>
            <p className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-nano leading-relaxed text-fg-muted">
              Run trace rows come from <strong className="text-fg-secondary">GET /api/logs</strong> (server ring +
              NDJSON in dev). The Clear button empties the in-memory rings only; today&apos;s file under{' '}
              <code className="text-fg-secondary">logs/observability</code> stays append-only. Inline
              Variant Inspector still uses live client traces; this tab is the audit view.
            </p>
            {traceEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-12 text-center text-xs text-fg-muted">
                No run trace yet. Start an agentic run to inspect tool flow, file writes, and hand-offs.
              </div>
            ) : (
              <div className="space-y-2">
                {traceEntries.map(({ trace, title, runNumber, rowKey }) => (
                  <TraceEntry
                    key={rowKey}
                    trace={trace}
                    title={title}
                    runNumber={runNumber}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
