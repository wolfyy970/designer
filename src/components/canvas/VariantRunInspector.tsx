import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { storage } from '../../storage';
import { useCanvasStore } from '../../stores/canvas-store';
import { useCompilerStore, findVariantStrategy } from '../../stores/compiler-store';
import type { VariantNodeData } from '../../types/canvas-data';
import { useVersionStack } from '../../hooks/useVersionStack';
import { useResultCode } from '../../hooks/useResultCode';
import { useResultFiles } from '../../hooks/useResultFiles';
import { useElapsedTimer } from '../../hooks/useElapsedTimer';
import { GENERATION_STATUS } from '../../constants/generation';
import { bundleVirtualFS, prepareIframeContent, renderErrorHtml } from '../../lib/iframe-utils';
import { normalizeError } from '../../lib/error-utils';
import {
  AgenticHarnessStripe,
  EvaluationScorecard,
  GeneratingFooter,
  Timeline,
  TodoTracker,
} from './variant-run';

type TabId = 'monitor' | 'design' | 'evaluation';

const TAB_DEFS: { id: TabId; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'design', label: 'Design' },
  { id: 'evaluation', label: 'Evaluation' },
];

function StatusDot({ status }: { status: string }) {
  const color =
    status === GENERATION_STATUS.COMPLETE ? 'bg-success' :
    status === GENERATION_STATUS.GENERATING ? 'bg-accent animate-pulse' :
    status === GENERATION_STATUS.ERROR ? 'bg-error' :
    'bg-fg-faint';
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export default function VariantRunInspector() {
  const runInspectorVariantNodeId = useCanvasStore((s) => s.runInspectorVariantNodeId);
  const closeRunInspector = useCanvasStore((s) => s.closeRunInspector);
  const nodes = useCanvasStore((s) => s.nodes);

  const node = useMemo(
    () =>
      runInspectorVariantNodeId
        ? nodes.find((n) => n.id === runInspectorVariantNodeId)
        : undefined,
    [nodes, runInspectorVariantNodeId],
  );

  useEffect(() => {
    if (!runInspectorVariantNodeId) return;
    if (!node || node.type !== 'variant') closeRunInspector();
  }, [runInspectorVariantNodeId, node, closeRunInspector]);

  useEffect(() => {
    if (!runInspectorVariantNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRunInspector();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [runInspectorVariantNodeId, closeRunInspector]);

  const [tab, setTab] = useState<TabId>('monitor');

  useEffect(() => {
    setTab('monitor');
  }, [runInspectorVariantNodeId]);

  const data = node?.type === 'variant' ? (node.data as VariantNodeData) : undefined;
  const variantStrategyId = data?.variantStrategyId;
  const pinnedRunId = data?.pinnedRunId;

  const { results, activeResult, versionKey } = useVersionStack(variantStrategyId, pinnedRunId);

  const legacyResult =
    !variantStrategyId && data?.refId
      ? results.find((r) => r.id === data.refId)
      : undefined;
  const result = activeResult ?? legacyResult;

  const strategy = useCompilerStore((s) => {
    const vsId = variantStrategyId ?? result?.variantStrategyId;
    if (!vsId) return undefined;
    return findVariantStrategy(s.dimensionMaps, vsId);
  });
  const variantName = strategy?.name ?? 'Variant';

  const { code, isLoading: codeLoading } = useResultCode(result?.id, result?.status);
  const { files, isLoading: filesLoading } = useResultFiles(result?.id, result?.status);

  const currentFiles = files ?? result?.liveFiles;
  const isGenerating = result?.status === GENERATION_STATUS.GENERATING;
  const elapsed = useElapsedTimer(isGenerating);

  const singleFileSrc = useMemo(() => {
    const src =
      result?.status === GENERATION_STATUS.GENERATING
        ? (result.liveCode ?? code)
        : code;
    if (!src) return '';
    try {
      return prepareIframeContent(src);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [result, code]);

  const rounds = result?.evaluationRounds ?? [];
  const [evalRoundIdx, setEvalRoundIdx] = useState(0);
  useEffect(() => {
    const n = result?.evaluationRounds?.length ?? 0;
    setEvalRoundIdx(n > 0 ? n - 1 : 0);
  }, [result?.id, result?.evaluationRounds?.length]);

  const safeRoundIdx = Math.min(evalRoundIdx, Math.max(0, rounds.length - 1));
  const selectedRound = rounds.length > 0 ? rounds[safeRoundIdx] : undefined;
  const evalSummary = selectedRound?.aggregate ?? result?.evaluationSummary;

  const lastRoundNum = rounds.length > 0 ? rounds[rounds.length - 1]!.round : undefined;
  const isLatestEvalRound =
    selectedRound != null && lastRoundNum != null && selectedRound.round === lastRoundNum;

  const [roundFilesFromIdb, setRoundFilesFromIdb] = useState<Record<string, string> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (
      !result?.id ||
      result.status !== GENERATION_STATUS.COMPLETE ||
      !selectedRound ||
      rounds.length <= 1
    ) {
      setRoundFilesFromIdb(undefined);
      return;
    }
    if (isLatestEvalRound) {
      setRoundFilesFromIdb(undefined);
      return;
    }
    let cancelled = false;
    void storage
      .loadRoundFiles(result.id, selectedRound.round)
      .then((f) => {
        if (!cancelled) setRoundFilesFromIdb(f);
      })
      .catch(() => {
        if (!cancelled) setRoundFilesFromIdb(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [result?.id, result?.status, selectedRound, rounds.length, isLatestEvalRound]);

  const designPreviewFiles = useMemo(() => {
    if (!result || rounds.length <= 1) {
      return currentFiles;
    }
    if (isLatestEvalRound) {
      return currentFiles;
    }
    return roundFilesFromIdb ?? selectedRound?.files ?? currentFiles;
  }, [
    result,
    rounds.length,
    isLatestEvalRound,
    roundFilesFromIdb,
    selectedRound?.files,
    currentFiles,
  ]);

  const designIsMultiFile =
    !!designPreviewFiles && Object.keys(designPreviewFiles).length > 0;
  const designBundledHtml = useMemo(() => {
    if (!designPreviewFiles || Object.keys(designPreviewFiles).length === 0) return '';
    try {
      return bundleVirtualFS(designPreviewFiles);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [designPreviewFiles]);

  const tabBtn = useCallback(
    (id: TabId, label: string) => (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
          tab === id
            ? 'bg-surface-secondary text-fg'
            : 'text-fg-muted hover:text-fg-secondary'
        }`}
      >
        {label}
      </button>
    ),
    [tab],
  );

  if (!runInspectorVariantNodeId || !node || node.type !== 'variant') return null;

  const statusLabel = result?.status ?? 'pending';
  const model = result?.metadata?.model;
  const durationSec = result?.metadata?.durationMs != null
    ? (result.metadata.durationMs / 1000).toFixed(1)
    : undefined;

  return (
    <aside
      className="flex min-h-0 w-[min(100vw,480px)] shrink-0 flex-col border-l border-border-subtle bg-surface pt-[var(--height-header)]"
      aria-label="Variant run workspace"
    >
      {/* ── Identity header ──────────────────────────────────── */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold leading-tight text-fg">
            {variantName}
          </h2>
          <button
            type="button"
            onClick={closeRunInspector}
            className="shrink-0 rounded p-0.5 text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-fg-muted">
          {versionKey && result?.runNumber != null && (
            <span className="tabular-nums text-fg-secondary">v{result.runNumber}</span>
          )}
          {model && (
            <>
              <span className="text-border">&middot;</span>
              <span className="truncate">{model}</span>
            </>
          )}
          {durationSec && (
            <>
              <span className="text-border">&middot;</span>
              <span className="tabular-nums">{durationSec}s</span>
            </>
          )}
          <span className="text-border">&middot;</span>
          <span className="flex items-center gap-1 capitalize">
            <StatusDot status={statusLabel} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1">
        {TAB_DEFS.map(({ id, label }) => tabBtn(id, label))}
      </div>

      {/* ── Tab content ──────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        {tab === 'monitor' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Generating progress strip (fixed, above resizable panels) */}
            {isGenerating && result && (
              <div className="shrink-0 border-b border-border-subtle">
                <AgenticHarnessStripe
                  phase={result.agenticPhase}
                  evaluationStatus={result.evaluationStatus}
                />
                <GeneratingFooter
                  plan={result.liveFilesPlan}
                  written={Object.keys(result.liveFiles ?? {}).length}
                  progressMessage={result.progressMessage}
                  elapsed={elapsed}
                  lastAgentFileAt={result.lastAgentFileAt}
                  lastActivityAt={result.lastActivityAt}
                  lastTraceAt={result.lastTraceAt}
                  activeToolName={result.activeToolName}
                  activeToolPath={result.activeToolPath}
                  liveTodos={result.liveTodos}
                  agenticPhase={result.agenticPhase}
                  evaluationStatus={result.evaluationStatus}
                />
              </div>
            )}

            {/* Tasks — fixed, auto-height, fits content snugly */}
            <div className="shrink-0 border-b border-border-subtle">
              <div className="flex items-center bg-surface-secondary/40 px-3 py-0.5">
                <span className="text-[8px] font-semibold uppercase tracking-widest text-fg-faint">Tasks</span>
              </div>
              {result?.liveTodos && result.liveTodos.length > 0 ? (
                <TodoTracker todos={result.liveTodos} />
              ) : (
                <p className="px-3 py-1.5 text-[10px] text-fg-muted">
                  {isGenerating ? 'Planning…' : 'No tasks.'}
                </p>
              )}
            </div>

            {/* Unified timeline — trace events + model output in one scroll */}
            <Timeline
              trace={result?.liveTrace}
              thinkingTurns={result?.thinkingTurns}
              activityByTurn={result?.activityByTurn}
              activityLog={result?.activityLog}
              isStreaming={isGenerating}
            />
          </div>
        )}

        {tab === 'design' && (
          <div className="flex min-h-0 flex-1 flex-col bg-bg">
            {rounds.length > 1 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
                <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">
                  Eval round
                </span>
                <select
                  className="nodrag max-w-[220px] rounded border border-border-subtle bg-surface px-2 py-0.5 text-[10px] text-fg"
                  value={safeRoundIdx}
                  onChange={(e) => setEvalRoundIdx(Number(e.target.value))}
                >
                  {rounds.map((r, i) => (
                    <option key={r.round} value={i}>
                      Round {r.round}
                      {r.round === lastRoundNum ? ' (final)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(codeLoading || filesLoading) && result?.status === GENERATION_STATUS.COMPLETE && (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 size={20} className="animate-spin text-fg-muted" />
              </div>
            )}
            {rounds.length > 1 &&
              !isLatestEvalRound &&
              result?.status === GENERATION_STATUS.COMPLETE &&
              !roundFilesFromIdb &&
              !selectedRound?.files && (
                <div className="flex flex-1 items-center justify-center px-3">
                  <Loader2 size={18} className="animate-spin text-fg-muted" />
                </div>
              )}
            {!codeLoading &&
              !filesLoading &&
              !(rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files) &&
              designIsMultiFile && (
              <iframe
                title={`Design preview: ${variantName}`}
                sandbox="allow-scripts"
                srcDoc={designBundledHtml || undefined}
                className="min-h-[240px] flex-1 border-0 bg-white"
              />
            )}
            {!codeLoading &&
              !filesLoading &&
              !(rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files) &&
              !designIsMultiFile &&
              singleFileSrc && (
              <iframe
                title={`Design preview: ${variantName}`}
                sandbox="allow-scripts"
                srcDoc={singleFileSrc}
                className="min-h-[240px] flex-1 border-0 bg-white"
              />
            )}
            {!codeLoading &&
              !filesLoading &&
              !(rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files) &&
              !designIsMultiFile &&
              !singleFileSrc && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-[10px] text-fg-muted">
                  {isGenerating
                    ? 'Preview appears when the first artifact is ready.'
                    : rounds.length > 1 && !isLatestEvalRound
                      ? 'No file snapshot for this round (re-run agentic to capture).'
                      : 'No preview available.'}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'evaluation' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rounds.length > 1 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
                <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">
                  Round
                </span>
                <select
                  className="nodrag max-w-[200px] rounded border border-border-subtle bg-surface px-2 py-0.5 text-[10px] text-fg"
                  value={safeRoundIdx}
                  onChange={(e) => setEvalRoundIdx(Number(e.target.value))}
                >
                  {rounds.map((r, i) => (
                    <option key={r.round} value={i}>
                      Round {r.round}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {evalSummary ? (
                <EvaluationScorecard
                  summary={evalSummary}
                  latestSnapshot={selectedRound}
                  className="max-h-none min-h-0 flex-1 border-t-0"
                />
              ) : (
                <p className="px-3 py-3 text-[10px] text-fg-muted">
                  {isGenerating
                    ? 'Evaluation runs after the build phase.'
                    : 'No evaluation data for this run.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
