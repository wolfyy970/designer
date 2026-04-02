import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
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
  ActivityLog,
  AgenticHarnessStripe,
  EvaluationScorecard,
  GeneratingFooter,
  LiveTraceList,
  TodoTracker,
} from './variant-run';

type TabId = 'status' | 'todos' | 'design' | 'evaluation' | 'activity';

const TAB_DEFS: { id: TabId; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'todos', label: 'Todos' },
  { id: 'design', label: 'Design' },
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'activity', label: 'Activity' },
];

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

  const [tab, setTab] = useState<TabId>('status');

  useEffect(() => {
    setTab('status');
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
  const isMultiFile = !!currentFiles && Object.keys(currentFiles).length > 0;
  const isGenerating = result?.status === GENERATION_STATUS.GENERATING;
  const elapsed = useElapsedTimer(isGenerating);

  const bundledHtml = useMemo(() => {
    if (!currentFiles || Object.keys(currentFiles).length === 0) return '';
    try {
      return bundleVirtualFS(currentFiles);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [currentFiles]);

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

  const tabBtn = useCallback(
    (id: TabId, label: string) => (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
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

  return (
    <aside
      className="flex min-h-0 w-[min(100vw,480px)] shrink-0 flex-col border-l border-border-subtle bg-surface"
      aria-label="Variant run workspace"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-fg">Run workspace</h2>
          <p className="truncate text-[10px] text-fg-muted">{variantName}</p>
          {versionKey && result?.runNumber != null && (
            <p className="text-[10px] tabular-nums text-fg-faint">v{result.runNumber}</p>
          )}
        </div>
        <button
          type="button"
          onClick={closeRunInspector}
          className="shrink-0 rounded p-1 text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1.5">
        {TAB_DEFS.map(({ id, label }) => tabBtn(id, label))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'status' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {result?.status === GENERATION_STATUS.GENERATING ? (
              <>
                <AgenticHarnessStripe
                  phase={result.agenticPhase}
                  evaluationStatus={result.evaluationStatus}
                />
                <div className="mt-auto">
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
              </>
            ) : result ? (
              <div className="space-y-2 px-3 py-3 text-[10px] text-fg-muted">
                <p>
                  <span className="font-medium text-fg-secondary">Status:</span>{' '}
                  {result.status}
                </p>
                {result.metadata.model && (
                  <p>
                    <span className="font-medium text-fg-secondary">Model:</span>{' '}
                    {result.metadata.model}
                  </p>
                )}
                {result.metadata.durationMs != null && (
                  <p>
                    <span className="font-medium text-fg-secondary">Duration:</span>{' '}
                    {(result.metadata.durationMs / 1000).toFixed(1)}s
                  </p>
                )}
                {result.agenticPhase && (
                  <p>
                    <span className="font-medium text-fg-secondary">Phase:</span>{' '}
                    {result.agenticPhase}
                  </p>
                )}
              </div>
            ) : (
              <p className="px-3 py-3 text-[10px] text-fg-muted">No active run for this variant.</p>
            )}
          </div>
        )}

        {tab === 'todos' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {result?.liveTodos && result.liveTodos.length > 0 ? (
              <TodoTracker todos={result.liveTodos} />
            ) : (
              <p className="px-3 py-3 text-[10px] text-fg-muted">
                {isGenerating
                  ? 'No task list yet — the agent may still be planning.'
                  : 'No tasks on this run.'}
              </p>
            )}
          </div>
        )}

        {tab === 'design' && (
          <div className="flex min-h-0 flex-1 flex-col bg-bg">
            {(codeLoading || filesLoading) && result?.status === GENERATION_STATUS.COMPLETE && (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 size={20} className="animate-spin text-fg-muted" />
              </div>
            )}
            {!codeLoading && !filesLoading && isMultiFile && (
              <iframe
                title={`Design preview: ${variantName}`}
                sandbox="allow-scripts"
                srcDoc={bundledHtml || undefined}
                className="min-h-[240px] flex-1 border-0 bg-white"
              />
            )}
            {!codeLoading && !filesLoading && !isMultiFile && singleFileSrc && (
              <iframe
                title={`Design preview: ${variantName}`}
                sandbox="allow-scripts"
                srcDoc={singleFileSrc}
                className="min-h-[240px] flex-1 border-0 bg-white"
              />
            )}
            {!codeLoading && !filesLoading && !isMultiFile && !singleFileSrc && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-[10px] text-fg-muted">
                  {isGenerating ? 'Preview appears when the first artifact is ready.' : 'No preview available.'}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'evaluation' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rounds.length > 1 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2">
                <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">
                  Round
                </span>
                <select
                  className="nodrag max-w-[200px] rounded border border-border-subtle bg-surface px-2 py-1 text-[10px] text-fg"
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

        {tab === 'activity' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {result?.liveTrace && result.liveTrace.length > 0 && (
              <div className="max-h-[40%] shrink-0 overflow-hidden border-b border-border-subtle">
                <LiveTraceList trace={result.liveTrace} />
              </div>
            )}
            <div className="flex min-h-[120px] flex-1 flex-col overflow-hidden">
              <ActivityLog entries={result?.activityLog} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
