import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useGenerationStore } from '../../../stores/generation-store';
import { normalizeError } from '../../../lib/error-utils';
import { useCompilerStore, findVariantStrategy } from '../../../stores/compiler-store';
import { prepareIframeContent, renderErrorHtml } from '../../../lib/iframe-utils';
import { preferredArtifactFileOrder } from '../../../lib/preview-entry';
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
import NodeShell from './NodeShell';
import VariantToolbar from './VariantToolbar';
import VariantFooter from './VariantFooter';
import { DesignDebugExportDialog, EvaluationScorecard } from '../variant-run';
import { VariantNodeGenerating } from './VariantNodeGenerating';
import { VariantNodeErrorState } from './VariantNodeErrorState';
import { VariantNodePendingState } from './VariantNodePendingState';
import { VariantNodeSingleFileBody } from './VariantNodeSingleFileBody';
import { VariantNodeMultiFileBody } from './VariantNodeMultiFileBody';
import { useVariantNodeDebugExport } from './useVariantNodeDebugExport';

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

  const legacyResult = useMemo(
    () =>
      !variantStrategyId && data.refId ? results.find((r) => r.id === data.refId) : undefined,
    [variantStrategyId, data.refId, results],
  );
  const result = activeResult ?? legacyResult;
  const laneStrategyIdForAbort = variantStrategyId ?? result?.variantStrategyId;

  const deleteResult = useGenerationStore((s) => s.deleteResult);

  const { code, isLoading: codeLoading } = useResultCode(result?.id, result?.status);
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

  const variantDeleteCopy = useMemo(() => variantNodeDeleteCopy(variantName), [variantName]);

  const onRemove = useCallback(() => {
    requestPermanentDelete({
      title: variantDeleteCopy.title,
      description: variantDeleteCopy.description,
      confirmLabel: variantDeleteCopy.confirmLabel,
      cancelLabel: variantDeleteCopy.cancelLabel,
      onConfirm: removeFromCanvas,
    });
  }, [variantDeleteCopy, removeFromCanvas, requestPermanentDelete]);

  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [activeCodeFile, setActiveCodeFile] = useState<string | undefined>(undefined);

  const currentFiles = files ?? result?.liveFiles;
  const isMultiFile = !!currentFiles && Object.keys(currentFiles).length > 0;

  useEffect(() => {
    if (activeTab === 'code' && !activeCodeFile && currentFiles) {
      const ordered = preferredArtifactFileOrder(currentFiles);
      const first = ordered[0] ?? Object.keys(currentFiles)[0];
      setActiveCodeFile(first);
    }
  }, [activeTab, activeCodeFile, currentFiles]);

  const handleDeleteVersion = useCallback(async () => {
    if (!result || !versionKey) return;
    const resultId = result.id;
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
    const { title, description, confirmLabel, cancelLabel } = variantVersionDeleteCopy();
    requestPermanentDelete({
      title,
      description,
      confirmLabel,
      cancelLabel,
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

  const {
    debugExportOpen,
    setDebugExportOpen,
    debugExportPreviewInput,
    handleConfirmDebugExport,
  } = useVariantNodeDebugExport({
    result,
    nodeId: id,
    variantName,
    strategy,
    slug,
    code,
    files,
  });

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

  const stackClass =
    stackTotal >= 3 ? 'variant-stack-deep' : stackTotal === 2 ? 'variant-stack' : '';

  return (
    <NodeShell
      nodeId={id}
      nodeType="variant"
      selected={!!selected}
      width="w-node-variant"
      status={status}
      className={`relative flex h-full min-h-[var(--min-height-variant-node)] flex-col${isArchived ? ' opacity-75' : ''} ${stackClass}`}
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
        onToggleWorkspace={() =>
          isWorkspaceOpen ? closeRunInspector() : setRunInspectorVariant(id)
        }
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

      <div ref={contentRef} className="relative flex-1 overflow-hidden">
        {result?.status === GENERATION_STATUS.GENERATING && (
          <VariantNodeGenerating
            result={result}
            elapsed={elapsed}
            isWorkspaceOpen={isWorkspaceOpen}
            onOpenWorkspace={() => setRunInspectorVariant(id)}
          />
        )}

        {result?.status === GENERATION_STATUS.ERROR && <VariantNodeErrorState result={result} />}

        {(!result || result.status === GENERATION_STATUS.PENDING) && <VariantNodePendingState />}

        {result?.status === GENERATION_STATUS.COMPLETE && !isMultiFile && (
          <VariantNodeSingleFileBody
            codeLoading={codeLoading}
            code={code}
            htmlContent={htmlContent}
            variantName={variantName}
            zoom={zoom}
          />
        )}

        {result?.status === GENERATION_STATUS.COMPLETE && isMultiFile && currentFiles && (
          <VariantNodeMultiFileBody
            variantName={variantName}
            zoom={zoom}
            currentFiles={currentFiles}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            activeCodeFile={activeCodeFile}
            onSelectCodeFile={setActiveCodeFile}
          />
        )}
      </div>

      {result?.status === GENERATION_STATUS.COMPLETE && result.evaluationSummary && (
        <EvaluationScorecard
          summary={result.evaluationSummary}
          latestSnapshot={result.evaluationRounds?.[result.evaluationRounds.length - 1]}
        />
      )}

      {result?.status === GENERATION_STATUS.COMPLETE && <VariantFooter result={result} />}

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
