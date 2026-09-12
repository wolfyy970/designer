import { useEffect, useMemo, useState } from 'react';
import { EVALUATOR_RUBRIC_IDS } from '../../types/evaluation';
import { storage } from '../../storage';
import { useCanvasStore } from '../../stores/canvas-store';
import { useIncubatorStore, findStrategy } from '../../stores/incubator-store';
import { getPreviewNodeData } from '../../lib/canvas-node-data';
import { resolveRoundFileView, shouldLoadRoundFiles } from './round-file-view';
import { useVersionStack } from '../../hooks/useVersionStack';
import { useResultCode } from '../../hooks/useResultCode';
import { useResultFiles } from '../../hooks/useResultFiles';
import { useElapsedTimer } from '../../hooks/useElapsedTimer';
import { GENERATION_STATUS } from '../../constants/generation';
import { prepareIframeContent, renderErrorHtml } from '../../lib/iframe-utils';
import { preferredArtifactFileOrder } from '../../lib/preview-entry';
import { normalizeError } from '../../lib/error-utils';
import { EvaluationTabPanel } from './variant-run';
import { VariantRunMonitorTab } from './variant-run-inspector/VariantRunMonitorTab';
import { VariantRunDesignTab } from './variant-run-inspector/VariantRunDesignTab';
import { VariantRunFilesTab } from './variant-run-inspector/VariantRunFilesTab';
import { VariantRunHeader } from './variant-run-inspector/VariantRunHeader';
import type { VariantRunTabId } from './variant-run-inspector/variant-run-tabs';


interface VariantRunInspectorProps {
  onPointerEnter?: () => void;
}

export default function VariantRunInspector({ onPointerEnter }: VariantRunInspectorProps) {
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
   * (rehydration / layout) and would immediately undo "Open run panel" right after open.
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

  const [tab, setTab] = useState<VariantRunTabId>('monitor');
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

  // Memoised so it is referentially stable: `result.evaluationRounds` is
  // replaced on every streamed update, and an unstable identity here defeats
  // the `roundFileView` memo below (and re-runs its dependency comparisons on
  // every render).
  const rounds = useMemo(() => result?.evaluationRounds ?? [], [result?.evaluationRounds]);
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
  /**
   * Whether a read for the selected round is in flight. Tracked separately from
   * the value because `undefined` means both "not read yet" and "read, nothing
   * stored" — and only one of those can still resolve. Without this the caller
   * cannot tell them apart, which is how a spinner for a round that has no
   * snapshot ended up never resolving.
   */
  const [roundFilesLoading, setRoundFilesLoading] = useState(false);
  const wantsRoundFiles = shouldLoadRoundFiles({
    hasResultId: !!result?.id,
    isComplete: result?.status === GENERATION_STATUS.COMPLETE,
    roundCount: rounds.length,
    selectedRound,
    isLatestRound: isLatestEvalRound,
  });
  useEffect(() => {
    if (!wantsRoundFiles || !result?.id || !selectedRound) {
      setRoundFilesFromIdb(undefined);
      setRoundFilesLoading(false);
      return;
    }
    let cancelled = false;
    setRoundFilesLoading(true);
    void storage
      .loadRoundFiles(result.id, selectedRound.round)
      .then((f) => {
        if (cancelled) return;
        setRoundFilesFromIdb(f);
      })
      .catch(() => {
        if (cancelled) return;
        setRoundFilesFromIdb(undefined);
      })
      .finally(() => {
        if (!cancelled) setRoundFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [result?.id, wantsRoundFiles, selectedRound]);

  /**
   * Which file map this panel shows, and — the part a bare `??` chain could not
   * express — *why*. `kind` distinguishes an older round whose snapshot is still
   * being read from one that has none, which is what the five duplicated
   * render-site conditions were each re-deriving by hand.
   */
  const roundFileView = useMemo(
    () =>
      resolveRoundFileView({
        currentFiles,
        rounds,
        selectedRound,
        roundFilesFromIdb,
        isLoadingRoundFiles: roundFilesLoading,
        isComplete: result?.status === GENERATION_STATUS.COMPLETE,
      }),
    [
      currentFiles,
      rounds,
      selectedRound,
      roundFilesFromIdb,
      roundFilesLoading,
      result?.status,
    ],
  );
  const designPreviewFiles = roundFileView.files;
  /**
   * An older round is selected and its snapshot is not available in any form.
   * The panels below deliberately render *nothing* in this case rather than
   * falling back to the live files, which would silently show a different
   * round's design under this round's label.
   */
  const olderRoundSnapshotUnavailable =
    roundFileView.kind === 'loading' || roundFileView.kind === 'missing';

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
      className="absolute inset-y-0 right-0 z-[41] flex h-full min-h-0 w-[var(--width-variant-inspector)] flex-col border-l border-border-subtle bg-surface shadow-lg"
      aria-label="Preview run panel"
      onPointerEnter={onPointerEnter}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <VariantRunHeader
        variantName={variantName}
        onClose={closeRunInspector}
        versionKey={versionKey}
        runNumber={result?.runNumber}
        model={model}
        durationSec={durationSec}
        statusLabel={statusLabel}
        tab={tab}
        onSelectTab={setTab}
        showEvaluationTabBadge={showEvaluationTabBadge}
        evalWorkersDoneCount={evalWorkersDoneCount}
      />

      {/* ── Tab content ──────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        {tab === 'monitor' && (
          <VariantRunMonitorTab result={result} isGenerating={isGenerating} elapsed={elapsed} />
        )}

        {tab === 'files' && (
          <VariantRunFilesTab
            rounds={rounds}
            safeRoundIdx={safeRoundIdx}
            lastRoundNum={lastRoundNum}
            onSelectRoundIndex={setEvalRoundIdx}
            codeLoading={codeLoading}
            filesLoading={filesLoading}
            isRunComplete={result?.status === GENERATION_STATUS.COMPLETE}
            roundSnapshotLoading={roundFileView.kind === 'loading'}
            roundSnapshotMissing={roundFileView.kind === 'missing'}
            writtenFiles={writtenForFilesTab ?? {}}
            plannedFiles={filesTabPlanned}
            activeFilePath={filesTabPath}
            onSelectFile={setFilesTabPath}
            isGenerating={isGenerating}
            writingFile={result?.activeToolPath}
            fileSnippet={filesTabSnippet}
          />
        )}

        {tab === 'design' && (
          <VariantRunDesignTab
            rounds={rounds}
            safeRoundIdx={safeRoundIdx}
            lastRoundNum={lastRoundNum}
            onSelectRoundIndex={setEvalRoundIdx}
            codeLoading={codeLoading}
            filesLoading={filesLoading}
            isRunComplete={result?.status === GENERATION_STATUS.COMPLETE}
            roundSnapshotUnavailable={olderRoundSnapshotUnavailable}
            roundSnapshotLoading={roundFileView.kind === 'loading'}
            isLatestRound={isLatestEvalRound}
            variantName={variantName}
            isGenerating={isGenerating}
            designIsMultiFile={designIsMultiFile}
            designPreviewFiles={designPreviewFiles}
            singleFileSrc={singleFileSrc}
          />
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
