import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@ds/components/ui/button';
import { EVALUATOR_RUBRIC_IDS, EVALUATOR_WORKER_COUNT } from '../../types/evaluation';
import { storage } from '../../storage';
import { useCanvasStore } from '../../stores/canvas-store';
import { useIncubatorStore, findStrategy } from '../../stores/incubator-store';
import { getPreviewNodeData } from '../../lib/canvas-node-data';
import { useVersionStack } from '../../hooks/useVersionStack';
import { useResultCode } from '../../hooks/useResultCode';
import { useResultFiles } from '../../hooks/useResultFiles';
import { useElapsedTimer } from '../../hooks/useElapsedTimer';
import { RF_INTERACTIVE } from '../../constants/canvas';
import { GENERATION_STATUS } from '../../constants/generation';
import { abortGenerationForStrategy } from '../../lib/generation-abort-registry';
import { prepareIframeContent, renderErrorHtml } from '../../lib/iframe-utils';
import { preferredArtifactFileOrder } from '../../lib/preview-entry';
import { normalizeError } from '../../lib/error-utils';
import { pickLivenessSlice, pickStreamingToolLiveness } from '../../types/provider';
import {
  AgenticHarnessStripe,
  ArtifactPreviewFrame,
  EvaluationTabPanel,
  GeneratingFooter,
  Timeline,
  TodoTracker,
} from './variant-run';
import FileExplorer from './nodes/FileExplorer';

type TabId = 'monitor' | 'files' | 'design' | 'evaluation';

const TAB_DEFS: { id: TabId; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'files', label: 'Files' },
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
  const runInspectorPreviewNodeId = useCanvasStore((s) => s.runInspectorPreviewNodeId);
  const closeRunInspector = useCanvasStore((s) => s.closeRunInspector);
  const nodes = useCanvasStore((s) => s.nodes);

  const node = useMemo(
    () =>
      runInspectorPreviewNodeId
        ? nodes.find((n) => n.id === runInspectorPreviewNodeId)
        : undefined,
    [nodes, runInspectorPreviewNodeId],
  );

  /**
   * Close only when the graph is known to no longer contain this preview (or type is wrong).
   * Do not close when `node` is missing but `nodes` is empty — that can happen transiently
   * (rehydration / layout) and would immediately undo "Open workspace" right after open.
   */
  useEffect(() => {
    if (!runInspectorPreviewNodeId) return;
    const matched = nodes.find((n) => n.id === runInspectorPreviewNodeId);
    if (matched) {
      if (matched.type !== 'preview') closeRunInspector();
      return;
    }
    if (nodes.length > 0) closeRunInspector();
  }, [runInspectorPreviewNodeId, nodes, closeRunInspector]);

  /** If the canvas is cleared while an inspector id is still set, drop the stale selection. */
  useEffect(() => {
    if (nodes.length > 0 || !runInspectorPreviewNodeId) return;
    closeRunInspector();
  }, [nodes.length, runInspectorPreviewNodeId, closeRunInspector]);

  useEffect(() => {
    if (!runInspectorPreviewNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRunInspector();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [runInspectorPreviewNodeId, closeRunInspector]);

  const [tab, setTab] = useState<TabId>('monitor');
  const [filesTabPath, setFilesTabPath] = useState<string | undefined>(undefined);

  useEffect(() => {
    setTab('monitor');
    setFilesTabPath(undefined);
  }, [runInspectorPreviewNodeId]);

  const data = getPreviewNodeData(node ?? undefined);
  const strategyId = data?.strategyId;
  const pinnedRunId = data?.pinnedRunId;

  const { results, activeResult, versionKey } = useVersionStack(strategyId, pinnedRunId);

  const legacyResult =
    !strategyId && data?.refId
      ? results.find((r) => r.id === data.refId)
      : undefined;
  const result = activeResult ?? legacyResult;
  const laneStrategyIdForAbort = strategyId ?? result?.strategyId;

  const strategy = useIncubatorStore((s) => {
    const vsId = strategyId ?? result?.strategyId;
    if (!vsId) return undefined;
    return findStrategy(s.incubationPlans, vsId);
  });
  const variantName = strategy?.name ?? 'Preview';

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

  const writtenForFilesTab = designPreviewFiles;
  const filesTabPlanned =
    isGenerating && result?.liveFilesPlan?.length ? result.liveFilesPlan : undefined;

  useEffect(() => {
    if (tab !== 'files') return;
    const written = writtenForFilesTab ?? {};
    const inWritten = filesTabPath != null && filesTabPath in written;
    const inPlanned = filesTabPlanned?.includes(filesTabPath ?? '') ?? false;
    if (filesTabPath && (inWritten || inPlanned)) return;
    const firstWritten =
      preferredArtifactFileOrder(written)[0] ?? Object.keys(written).sort()[0];
    const next = firstWritten ?? filesTabPlanned?.[0];
    setFilesTabPath(next);
  }, [tab, writtenForFilesTab, filesTabPlanned, filesTabPath]);

  const filesTabSnippet =
    filesTabPath && writtenForFilesTab && writtenForFilesTab[filesTabPath] != null
      ? writtenForFilesTab[filesTabPath]
      : undefined;

  const evalWorkers = result?.liveEvalWorkers;
  const evalWorkersDoneCount = useMemo(
    () =>
      evalWorkers ? EVALUATOR_RUBRIC_IDS.filter((r) => evalWorkers[r] != null).length : 0,
    [evalWorkers],
  );
  const showEvaluationTabBadge =
    tab !== 'evaluation' &&
    isGenerating &&
    (result?.agenticPhase === 'evaluating' || evalWorkersDoneCount > 0);

  if (!runInspectorPreviewNodeId || !node || node.type !== 'preview') return null;

  const statusLabel = result?.status ?? 'pending';
  const model = result?.metadata?.model;
  const durationSec = result?.metadata?.durationMs != null
    ? (result.metadata.durationMs / 1000).toFixed(1)
    : undefined;

  return (
    <aside
      className="flex min-h-0 w-[var(--width-variant-inspector)] shrink-0 flex-col border-l border-border-subtle bg-surface pt-[var(--height-header)]"
      aria-label="Preview run workspace"
    >
      {/* ── Identity header ──────────────────────────────────── */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold leading-tight text-fg">
            {variantName}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {isGenerating && laneStrategyIdForAbort ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => abortGenerationForStrategy(laneStrategyIdForAbort)}
                title="Stop generation (cancels the in-flight request)"
              >
                Stop
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="iconSm"
              onClick={closeRunInspector}
              title="Close (Esc)"
            >
              <X size={14} />
            </Button>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-nano text-fg-muted">
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
        {TAB_DEFS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center rounded px-2 py-0.5 text-nano font-medium transition-colors ${
              tab === id
                ? 'bg-surface-nested text-fg'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {label}
            {id === 'evaluation' && showEvaluationTabBadge ? (
              <>
                <span
                  className="ml-1 inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
                  aria-hidden
                />
                <span className="ml-0.5 shrink-0 tabular-nums text-fg-faint">
                  ({evalWorkersDoneCount}/{EVALUATOR_WORKER_COUNT})
                </span>
              </>
            ) : null}
          </button>
        ))}
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
                  progressMessage={result.progressMessage}
                />
                <GeneratingFooter
                  plan={result.liveFilesPlan}
                  written={Object.keys(result.liveFiles ?? {}).length}
                  elapsed={elapsed}
                  liveness={pickLivenessSlice(result)}
                  liveTodos={result.liveTodos}
                  skillCatalogEmpty={result.liveSkills != null && result.liveSkills.length === 0}
                  liveActivatedSkills={result.liveActivatedSkills}
                />
              </div>
            )}

            {/* Tasks — fixed, auto-height, fits content snugly */}
            <div className="shrink-0 border-b border-border-subtle">
              <div className="flex items-center bg-surface-nested/40 px-3 py-0.5">
                <span className="text-pico font-semibold uppercase tracking-widest text-fg-faint">Tasks</span>
              </div>
              {result?.liveTodos && result.liveTodos.length > 0 ? (
                <TodoTracker todos={result.liveTodos} />
              ) : (
                <p className="px-3 py-1.5 text-nano text-fg-muted">
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
              streamingLiveness={result ? pickStreamingToolLiveness(result) : undefined}
            />
          </div>
        )}

        {tab === 'files' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
            {rounds.length > 1 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
                <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
                  Eval round
                </span>
                <select
                  className="nodrag max-w-[var(--width-model-trigger)] rounded border border-border-subtle bg-surface px-2 py-0.5 text-nano text-fg"
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
              (Object.keys(writtenForFilesTab ?? {}).length > 0 ||
                (filesTabPlanned?.length ?? 0) > 0) && (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <div className="flex w-[var(--width-inspector-tab)] shrink-0 flex-col border-r border-border-subtle bg-surface">
                    <div className="border-b border-border-subtle px-2 py-1.5">
                      <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
                        Files
                      </span>
                    </div>
                    <FileExplorer
                      files={writtenForFilesTab ?? {}}
                      plannedFiles={filesTabPlanned}
                      activeFile={filesTabPath}
                      onSelectFile={setFilesTabPath}
                      isGenerating={isGenerating}
                      writingFile={result?.activeToolPath}
                      allowSelectPlanned
                      className="flex-1 min-h-0"
                    />
                  </div>
                  <div className={`${RF_INTERACTIVE} min-h-0 min-w-0 flex-1 overflow-y-auto`}>
                    {filesTabSnippet != null ? (
                      <pre className="min-h-full p-3 font-mono text-nano leading-relaxed text-fg-secondary whitespace-pre-wrap">
                        {filesTabSnippet}
                      </pre>
                    ) : (
                      <p className="p-3 text-nano text-fg-muted">
                        {filesTabPath
                          ? 'Not written yet — watch the Monitor stream for updates.'
                          : 'No files in this run.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            {!codeLoading &&
              !filesLoading &&
              !(rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files) &&
              Object.keys(writtenForFilesTab ?? {}).length === 0 &&
              (filesTabPlanned?.length ?? 0) === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                  <p className="text-nano text-fg-muted">
                    {isGenerating
                      ? 'Paths appear here when the agent plans and writes files.'
                      : 'No project files for this run.'}
                  </p>
                </div>
              )}
          </div>
        )}

        {tab === 'design' && (
          <div className="flex min-h-0 flex-1 flex-col bg-bg">
            {rounds.length > 1 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
                <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
                  Eval round
                </span>
                <select
                  className="nodrag max-w-[var(--width-model-trigger)] rounded border border-border-subtle bg-surface px-2 py-0.5 text-nano text-fg"
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
              designIsMultiFile &&
              designPreviewFiles && (
              <ArtifactPreviewFrame
                files={designPreviewFiles}
                title={`Design preview: ${variantName}`}
                className="min-h-[var(--min-height-input-textarea)] flex-1 border-0 bg-preview-canvas"
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
                className="min-h-[var(--min-height-input-textarea)] flex-1 border-0 bg-preview-canvas"
              />
            )}
            {!codeLoading &&
              !filesLoading &&
              !(rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files) &&
              !designIsMultiFile &&
              !singleFileSrc && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-nano text-fg-muted">
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
          <EvaluationTabPanel
            isGenerating={isGenerating}
            agenticPhase={result?.agenticPhase}
            liveEvalWorkers={result?.liveEvalWorkers}
            evalWorkersDoneCount={evalWorkersDoneCount}
            rounds={rounds}
            lastRoundNum={lastRoundNum}
            evalSummary={evalSummary}
            selectedRound={selectedRound}
          />
        )}
      </div>
    </aside>
  );
}
