import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useSpecStore } from '../stores/spec-store';
import { useCompilerStore, findVariantStrategy } from '../stores/compiler-store';
import { useGenerationStore, nextRunNumber } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import {
  DEFAULT_COMPILER_PROVIDER,
  FIT_VIEW_DELAY_MS,
  FIT_VIEW_DURATION_MS,
} from '../lib/constants';
import { warnIfWorkspaceSnapshotInvalid } from '../lib/workspace-snapshot-warn';
import { buildHypothesisGenerationContext } from '../workspace/workspace-session';
import { normalizeError } from '../lib/error-utils';
import { normalizeModelProfilesForApi } from '../workspace/hypothesis-generation-pure';
import { GENERATION_STATUS } from '../constants/generation';
import { EDGE_STATUS } from '../constants/canvas';
import {
  fetchHypothesisPromptBundle,
  generateHypothesisStream,
} from '../api/client';
import type { HypothesisGenerateApiPayload } from '../api/types';
import {
  applyGenerationFailureToLanes,
  executeHypothesisGenerationRun,
} from './hypothesis-generation-run';
import {
  clearGenerationAbortController,
  GENERATION_STOPPED_MESSAGE,
  isAbortError,
  swapGenerationAbortController,
} from '../lib/generation-abort-registry';

interface HypothesisGenerationParams {
  nodeId: string;
  strategyId: string;
}

interface GenerationProgress {
  completed: number;
  total: number;
}

/**
 * Encapsulates all generation orchestration for a HypothesisNode.
 * Prompt assembly runs on the server (`/api/hypothesis/prompt-bundle`);
 * multi-model runs use one multiplexed SSE stream (`/api/hypothesis/generate`).
 */
export function useHypothesisGeneration({
  nodeId,
  strategyId,
}: HypothesisGenerationParams) {
  const { fitView } = useReactFlow();

  const spec = useSpecStore((s) => s.spec);
  const strategy = useCompilerStore(
    (s) => findVariantStrategy(s.dimensionMaps, strategyId),
  );
  const setCompiledPrompts = useCompilerStore((s) => s.setCompiledPrompts);
  const setGenerating = useGenerationStore((s) => s.setGenerating);
  const addResult = useGenerationStore((s) => s.addResult);
  const updateResult = useGenerationStore((s) => s.updateResult);

  const isGenerating = useGenerationStore((s) =>
    s.results.some((r) => r.variantStrategyId === strategyId && r.status === GENERATION_STATUS.GENERATING),
  );

  const syncAfterGenerate = useCanvasStore((s) => s.syncAfterGenerate);
  const setEdgeStatusBySource = useCanvasStore((s) => s.setEdgeStatusBySource);
  const setEdgeStatusByTarget = useCanvasStore((s) => s.setEdgeStatusByTarget);
  const clearVariantNodeIdMap = useCanvasStore((s) => s.clearVariantNodeIdMap);

  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGenerating) setGenerationProgress(null);
  }, [isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!strategy) return;

    const snapshot = useCanvasStore.getState();
    const genCtx = buildHypothesisGenerationContext({
      hypothesisNodeId: nodeId,
      variantStrategy: strategy,
      snapshot: { nodes: snapshot.nodes, edges: snapshot.edges },
      spec,
    });
    if (!genCtx) return;

    const runId = crypto.randomUUID();

    const domain = useWorkspaceDomainStore.getState();
    const workspacePayload: HypothesisGenerateApiPayload = {
      hypothesisNodeId: nodeId,
      variantStrategy: strategy,
      spec,
      snapshot: { nodes: snapshot.nodes, edges: snapshot.edges },
      domainHypothesis: domain.hypotheses[nodeId] ?? null,
      modelProfiles: normalizeModelProfilesForApi(
        domain.modelProfiles,
        DEFAULT_COMPILER_PROVIDER,
      ),
      designSystems: domain.designSystems,
      defaultCompilerProvider: DEFAULT_COMPILER_PROVIDER,
      correlationId: runId,
    };
    warnIfWorkspaceSnapshotInvalid(workspacePayload.snapshot, 'useHypothesisGeneration');

    setEdgeStatusBySource(nodeId, EDGE_STATUS.PROCESSING);
    setGenerationError(null);

    setGenerating(true);
    setGenerationProgress({
      completed: 0,
      total: genCtx.modelCredentials.length,
    });

    let lanePlaceholderIds: string[] = [];
    const abortController = swapGenerationAbortController(strategyId);

    try {
      const onLaneComplete = (id: string) => {
        setGenerationProgress((prev) =>
          prev ? { ...prev, completed: prev.completed + 1 } : null,
        );
        const r = useGenerationStore.getState().results.find((x) => x.id === id);
        if (r) {
          const variantNodeId = useCanvasStore.getState().variantNodeIdMap.get(
            r.variantStrategyId,
          );
          if (variantNodeId) {
            setEdgeStatusByTarget(variantNodeId, EDGE_STATUS.COMPLETE);
          }
        }
      };

      const runResult = await executeHypothesisGenerationRun(
        {
          workspacePayload,
          genCtx,
          nodeId,
          runId,
          signal: abortController.signal,
          setCompiledPrompts,
          addResult,
          updateResult,
          nextRunNumberForVariant: (variantStrategyId) =>
            nextRunNumber(useGenerationStore.getState(), variantStrategyId),
          syncAfterGenerate,
          getCanvasState: () => useCanvasStore.getState(),
          scheduleFitView: () =>
            setTimeout(
              () => fitView({ duration: FIT_VIEW_DURATION_MS, padding: 0.15 }),
              FIT_VIEW_DELAY_MS,
            ),
          fetchBundle: fetchHypothesisPromptBundle,
          runStream: generateHypothesisStream,
          onLaneIdsReady: (ids) => {
            lanePlaceholderIds = [...ids];
          },
        },
        onLaneComplete,
      );

      if (!runResult.ok) {
        setGenerationError('No prompt from server');
        setGenerating(false);
        setEdgeStatusBySource(nodeId, EDGE_STATUS.ERROR);
        return;
      }
    } catch (err) {
      const aborted = isAbortError(err);
      const msg = aborted
        ? GENERATION_STOPPED_MESSAGE
        : normalizeError(err, 'Generation failed');
      applyGenerationFailureToLanes(
        lanePlaceholderIds,
        msg,
        () => useGenerationStore.getState().results,
        updateResult,
      );
      if (aborted) {
        setGenerationError(null);
        setEdgeStatusBySource(nodeId, EDGE_STATUS.COMPLETE);
      } else {
        setGenerationError(msg);
        setEdgeStatusBySource(nodeId, EDGE_STATUS.ERROR);
      }
    } finally {
      clearGenerationAbortController(strategyId, abortController);
      clearVariantNodeIdMap();
      setEdgeStatusBySource(nodeId, EDGE_STATUS.COMPLETE);
      const stillGenerating = useGenerationStore.getState().results.some(
        (r) => r.status === GENERATION_STATUS.GENERATING,
      );
      if (!stillGenerating) setGenerating(false);

      const n = genCtx.modelCredentials.length;
      const idSet = new Set(lanePlaceholderIds);
      const errorCount = useGenerationStore
        .getState()
        .results.filter(
          (r) =>
            idSet.has(r.id) &&
            r.variantStrategyId === strategyId &&
            r.status === GENERATION_STATUS.ERROR &&
            r.error !== GENERATION_STOPPED_MESSAGE,
        ).length;
      if (errorCount > 0) {
        setGenerationError(
          errorCount === n ? 'Generation failed' : `${errorCount} of ${n} failed`,
        );
      }
    }
  }, [
    strategy,
    nodeId,
    spec,
    setCompiledPrompts,
    setGenerating,
    addResult,
    updateResult,
    syncAfterGenerate,
    clearVariantNodeIdMap,
    setEdgeStatusBySource,
    setEdgeStatusByTarget,
    fitView,
    strategyId,
  ]);

  return { handleGenerate, generationProgress, generationError };
}
