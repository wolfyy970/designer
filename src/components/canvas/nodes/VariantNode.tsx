import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useGenerationStore } from '../../../stores/generation-store';
import { normalizeError } from '../../../lib/error-utils';
import { useCompilerStore, findVariantStrategy } from '../../../stores/compiler-store';
import { bundleVirtualFS, prepareIframeContent, renderErrorHtml } from '../../../lib/iframe-utils';
import { useCanvasStore } from '../../../stores/canvas-store';
import type { VariantNodeData } from '../../../types/canvas-data';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useRequestPermanentDelete } from '../../../hooks/useRequestPermanentDelete';
import {
  variantNodeDeleteCopy,
  variantVersionDeleteCopy,
} from '../../../lib/canvas-permanent-delete-copy';
import { useResultCode } from '../../../hooks/useResultCode';
import { useResultFiles } from '../../../hooks/useResultFiles';
import { useVersionStack } from '../../../hooks/useVersionStack';
import { useVariantZoom } from '../../../hooks/useVariantZoom';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import { variantStatus } from '../../../lib/node-status';
import { GENERATION_STATUS } from '../../../constants/generation';
import { abortGenerationForStrategy } from '../../../lib/generation-abort-registry';
import { downloadFilesAsZip } from '../../../lib/zip-utils';
import {
  type DesignDebugExportOptions,
  buildDesignRunDebugMarkdown,
  downloadTextFile,
} from '../../../lib/debug-markdown-export';
import { loadProvenance, loadCode, loadFiles } from '../../../services/idb-storage';
import NodeShell from './NodeShell';
import VariantToolbar from './VariantToolbar';
import VariantFooter from './VariantFooter';
import FileExplorer from './FileExplorer';
import {
  DesignDebugExportDialog,
  EvaluationScorecard,
  GeneratingFooter,
  AgenticHarnessStripe,
} from '../variant-run';

type VariantNodeType = Node<VariantNodeData, 'variant'>;

function VariantNode({ id, data, selected }: NodeProps<VariantNodeType>) {
  const variantStrategyId = data.variantStrategyId;
  const pinnedRunId = data.pinnedRunId;
  const isArchived = !!pinnedRunId;

  const {
    results,
    stack,
    activeResult,
    completedStack,
    isActiveBest,
    bestCompletedResult,
    stackIndex,
    stackTotal,
    versionKey,
    goNewer,
    goOlder,
    setSelectedVersion,
    setUserBest,
    userBestOverrides,
  } = useVersionStack(variantStrategyId, pinnedRunId);

  const hasUserBestOverride = !!(variantStrategyId && userBestOverrides[variantStrategyId]);

  // Legacy fallback: if no variantStrategyId, use refId directly
  const legacyResult = useMemo(
    () =>
      !variantStrategyId && data.refId
        ? results.find((r) => r.id === data.refId)
        : undefined,
    [variantStrategyId, data.refId, results],
  );
  const result = activeResult ?? legacyResult;
  const laneStrategyIdForAbort = variantStrategyId ?? result?.variantStrategyId;

  const deleteResult = useGenerationStore((s) => s.deleteResult);

  // Load code from IndexedDB (single-file)
  const { code, isLoading: codeLoading } = useResultCode(result?.id, result?.status);

  // Load files from IndexedDB (multi-file)
  const { files } = useResultFiles(result?.id, result?.status);

  const strategy = useCompilerStore((s) => {
    const vsId = variantStrategyId ?? result?.variantStrategyId;
    if (!vsId) return undefined;
    return findVariantStrategy(s.dimensionMaps, vsId);
  });

  const setExpandedVariant = useCanvasStore((s) => s.setExpandedVariant);
  const setRunInspectorVariant = useCanvasStore((s) => s.setRunInspectorVariant);
  const closeRunInspector = useCanvasStore((s) => s.closeRunInspector);
  const isWorkspaceOpen = useCanvasStore((s) => s.runInspectorVariantNodeId === id);

  const variantName = strategy?.name ?? 'Variant';

  const removeFromCanvas = useNodeRemoval(id);
  const { requestPermanentDelete } = useRequestPermanentDelete();

  const variantDeleteCopy = useMemo(
    () => variantNodeDeleteCopy(variantName),
    [variantName],
  );

  const onRemove = useCallback(() => {
    requestPermanentDelete({
      title: variantDeleteCopy.title,
      description: variantDeleteCopy.description,
      onConfirm: removeFromCanvas,
    });
  }, [variantDeleteCopy, removeFromCanvas, requestPermanentDelete]);

  // Tab state for multi-file complete view
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [activeCodeFile, setActiveCodeFile] = useState<string | undefined>(undefined);

  // Determine whether we're in multi-file mode
  const currentFiles = files ?? result?.liveFiles;
  const isMultiFile = !!currentFiles && Object.keys(currentFiles).length > 0;

  // Auto-select code file when switching to code tab
  useEffect(() => {
    if (activeTab === 'code' && !activeCodeFile && currentFiles) {
      const preferred = ['index.html', 'styles.css', 'app.js'];
      const first = preferred.find((p) => p in currentFiles) ?? Object.keys(currentFiles)[0];
      setActiveCodeFile(first);
    }
  }, [activeTab, activeCodeFile, currentFiles]);

  // Bundled HTML for multi-file preview
  const bundledHtml = useMemo(() => {
    if (!currentFiles || Object.keys(currentFiles).length === 0) return '';
    try {
      return bundleVirtualFS(currentFiles);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [currentFiles]);

  const handleDeleteVersion = useCallback(async () => {
    if (!result || !versionKey) return;
    const resultId = result.id;
    // Select a survivor before deleting (use full stack — not only completed —
    // so multi-lane / error / in-flight rows keep a stable selection).
    if (stack.length > 1) {
      const nextResult =
        completedStack.find((r) => r.id !== resultId) ?? stack.find((r) => r.id !== resultId);
      if (nextResult) {
        setSelectedVersion(versionKey, nextResult.id);
      }
    }
    deleteResult(resultId);
  }, [result, versionKey, completedStack, stack, setSelectedVersion, deleteResult]);

  const confirmDeleteVersion = useCallback(() => {
    const { title, description } = variantVersionDeleteCopy();
    requestPermanentDelete({
      title,
      description,
      onConfirm: () => {
        void handleDeleteVersion();
      },
    });
  }, [handleDeleteVersion, requestPermanentDelete]);

  const slug = variantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const handleDownload = useCallback(() => {
    if (files && Object.keys(files).length > 0) {
      downloadFilesAsZip(files, `${slug}.zip`);
    } else if (code) {
      const blob = new Blob([code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [files, code, slug]);

  const [debugExportOpen, setDebugExportOpen] = useState(false);

  const debugExportPreviewInput = useMemo(
    () =>
      result
        ? {
            exportedAt: new Date().toISOString(),
            variantNodeId: id,
            variantName,
            strategyName: strategy?.name,
            strategy,
            result,
            code: code ?? result.liveCode ?? undefined,
            files: files ?? result.liveFiles ?? undefined,
          }
        : null,
    [id, variantName, strategy, result, code, files],
  );

  const handleConfirmDebugExport = useCallback(
    async (exportOptions: DesignDebugExportOptions) => {
      if (!result) return;
      const safeLoad = async <T,>(p: Promise<T | undefined>): Promise<T | undefined> => {
        try {
          return await p;
        } catch {
          return undefined;
        }
      };
      const [provenance, codeIdb, filesIdb] = await Promise.all([
        safeLoad(loadProvenance(result.id)),
        safeLoad(loadCode(result.id)),
        safeLoad(loadFiles(result.id)),
      ]);
      const mergedFiles = filesIdb ?? files ?? result.liveFiles;
      const mergedCode = codeIdb ?? code ?? result.liveCode;
      const md = buildDesignRunDebugMarkdown(
        {
          exportedAt: new Date().toISOString(),
          variantNodeId: id,
          variantName,
          strategyName: strategy?.name,
          strategy,
          result,
          provenance: provenance ?? undefined,
          code: mergedCode ?? undefined,
          files: mergedFiles ?? undefined,
        },
        exportOptions,
      );
      const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      downloadTextFile(`${slug}-run-v${result.runNumber}-debug-${stamp}.md`, md);
      setDebugExportOpen(false);
    },
    [id, result, variantName, strategy, slug, code, files],
  );

  const { contentRef, zoom, zoomIn, zoomOut, resetZoom } = useVariantZoom();

  const isGenerating = result?.status === GENERATION_STATUS.GENERATING;
  const elapsed = useElapsedTimer(isGenerating);

  const htmlContent = useMemo(() => {
    if (!code) return '';
    try {
      return prepareIframeContent(code);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [code]);

  const hasCode = result?.status === GENERATION_STATUS.COMPLETE && (!!code || isMultiFile);

  const status = variantStatus({
    isArchived,
    isError: result?.status === GENERATION_STATUS.ERROR,
    isGenerating: result?.status === GENERATION_STATUS.GENERATING,
    hasCode,
  });

  const stackClass = stackTotal >= 3
    ? 'variant-stack-deep'
    : stackTotal === 2
      ? 'variant-stack'
      : '';

  return (
    <NodeShell
      nodeId={id}
      nodeType="variant"
      selected={!!selected}
      width="w-node-variant"
      status={status}
      className={`relative flex h-full min-h-[420px] flex-col${isArchived ? ' opacity-75' : ''} ${stackClass}`}
      handleColor={hasCode ? 'green' : 'amber'}
    >
      <VariantToolbar
        variantName={variantName}
        isArchived={isArchived}
        isBestCurrent={isActiveBest && result?.status !== GENERATION_STATUS.GENERATING}
        hasCode={hasCode}
        nodeId={id}
        showStopGeneration={
          result?.status === GENERATION_STATUS.GENERATING && !!laneStrategyIdForAbort
        }
        onStopGeneration={
          laneStrategyIdForAbort
            ? () => abortGenerationForStrategy(laneStrategyIdForAbort)
            : undefined
        }
        versionStackLength={stack.length}
        stackTotal={stackTotal}
        stackIndex={stackIndex}
        goNewer={goNewer}
        goOlder={goOlder}
        zoom={zoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
        onDownload={handleDownload}
        onDownloadDebug={result ? () => setDebugExportOpen(true) : undefined}
        onDeleteVersion={confirmDeleteVersion}
        onExpand={() => setExpandedVariant(id)}
        onToggleWorkspace={() => isWorkspaceOpen ? closeRunInspector() : setRunInspectorVariant(id)}
        isWorkspaceOpen={isWorkspaceOpen}
        onRemove={onRemove}
        showClearUserBest={!isArchived && hasUserBestOverride}
        showMarkUserBest={
          !isArchived &&
          !!variantStrategyId &&
          result?.status === GENERATION_STATUS.COMPLETE &&
          !!result &&
          result.id !== bestCompletedResult?.id
        }
        onClearUserBest={
          variantStrategyId ? () => setUserBest(variantStrategyId, null) : undefined
        }
        onMarkUserBest={
          variantStrategyId && result
            ? () => setUserBest(variantStrategyId, result.id)
            : undefined
        }
      />

      {/* ── Content area ──────────────────────────────────────── */}
      <div ref={contentRef} className="relative flex-1 overflow-hidden">

        {/* States 1 & 2: GENERATING */}
        {result?.status === GENERATION_STATUS.GENERATING && (
          <div className="absolute inset-0 flex flex-col bg-surface">
            <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-4 py-3">
              <AgenticHarnessStripe
                phase={result.agenticPhase}
                evaluationStatus={result.evaluationStatus}
              />
              <p className="text-center text-[11px] text-fg-secondary">
                Generating in workspace — open the side panel for tasks, activity, and preview.
              </p>
              <button
                type="button"
                className="nodrag nowheel rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRunInspectorVariant(id);
                }}
              >
                Open workspace
              </button>
            </div>
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

        {/* Error state */}
        {result?.status === GENERATION_STATUS.ERROR && (
          <div className="flex h-full flex-col items-center justify-center bg-error-subtle p-4">
            <AlertCircle size={16} className="mb-2 text-error" />
            <p className="text-center text-xs text-error">
              {result.error ?? 'Generation failed'}
            </p>
          </div>
        )}

        {/* Pending / no result */}
        {(!result || result.status === GENERATION_STATUS.PENDING) && (
          <div className="flex h-full items-center justify-center bg-surface">
            <p className="text-xs text-fg-muted">Waiting...</p>
          </div>
        )}

        {/* State 3: COMPLETE, single-file */}
        {result?.status === GENERATION_STATUS.COMPLETE && !isMultiFile && (
          <>
            {/* Loading code from IndexedDB */}
            {codeLoading && (
              <div className="flex h-full items-center justify-center bg-surface">
                <Loader2 size={14} className="animate-spin text-fg-muted" />
              </div>
            )}

            {/* Complete but code missing from IndexedDB */}
            {!codeLoading && !code && (
              <div className="flex h-full flex-col items-center justify-center bg-surface p-4">
                <AlertCircle size={16} className="mb-2 text-fg-muted" />
                <p className="text-center text-xs text-fg-muted">
                  Code unavailable — may need to regenerate
                </p>
              </div>
            )}

            {/* Complete: rendered preview */}
            {code && (
              <iframe
                srcDoc={htmlContent}
                sandbox="allow-scripts"
                title={`Variant: ${variantName}`}
                className="absolute left-0 top-0 border-0 bg-white"
                style={{
                  width: `${100 / zoom}%`,
                  height: `${100 / zoom}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                  pointerEvents: 'auto',
                }}
              />
            )}
          </>
        )}

        {/* State 4: COMPLETE, multi-file — tab bar with preview/code */}
        {result?.status === GENERATION_STATUS.COMPLETE && isMultiFile && (
          <div className="absolute inset-0 flex flex-col">
            {/* Tab bar */}
            <div className="flex border-b border-border-subtle bg-surface shrink-0">
              {(['preview', 'code'] as const).map((tab) => (
                <button
                  key={tab}
                  onPointerDown={() => setActiveTab(tab)}
                  className={`nodrag px-3 py-1.5 text-[10px] font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'border-b border-accent text-fg'
                      : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Preview tab */}
            {activeTab === 'preview' && (
              <div className="relative flex-1 overflow-hidden">
                <iframe
                  srcDoc={bundledHtml}
                  sandbox="allow-scripts"
                  title={`Variant: ${variantName}`}
                  className="absolute left-0 top-0 border-0 bg-white"
                  style={{
                    width: `${100 / zoom}%`,
                    height: `${100 / zoom}%`,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0',
                    pointerEvents: 'auto',
                  }}
                />
              </div>
            )}
            {/* Code tab */}
            {activeTab === 'code' && (
              <div className="flex flex-1 overflow-hidden">
                <div className="w-28 shrink-0 border-r border-border-subtle bg-surface flex flex-col">
                  <div className="px-2 py-1.5 border-b border-border-subtle">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">Files</span>
                  </div>
                  <FileExplorer
                    files={currentFiles!}
                    activeFile={activeCodeFile}
                    onSelectFile={setActiveCodeFile}
                    isGenerating={false}
                    className="flex-1"
                  />
                </div>
                <div className="nodrag nowheel flex-1 overflow-auto bg-bg">
                  <pre className="min-h-full p-3 font-mono text-[10px] leading-relaxed text-fg-secondary whitespace-pre-wrap">
                    {activeCodeFile && currentFiles?.[activeCodeFile]}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Evaluation (completed agentic runs) ───────────────── */}
      {result?.status === GENERATION_STATUS.COMPLETE && result.evaluationSummary && (
        <EvaluationScorecard
          summary={result.evaluationSummary}
          latestSnapshot={result.evaluationRounds?.[result.evaluationRounds.length - 1]}
        />
      )}

      {/* ── Metadata footer ─────────────────────────────────── */}
      {result?.status === GENERATION_STATUS.COMPLETE && (
        <VariantFooter result={result} />
      )}

      {debugExportPreviewInput ? (
        <DesignDebugExportDialog
          open={debugExportOpen}
          onClose={() => setDebugExportOpen(false)}
          variantLabel={variantName}
          previewInput={debugExportPreviewInput}
          onConfirm={handleConfirmDebugExport}
        />
      ) : null}
    </NodeShell>
  );
}

export default memo(VariantNode);
