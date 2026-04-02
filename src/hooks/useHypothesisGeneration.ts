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
import {
  buildHypothesisGenerationContext,
  provenanceFromHypothesisContext,
} from '../workspace/workspace-session';
import { normalizeModelProfilesForApi } from '../workspace/hypothesis-generation-pure';
import { GENERATION_STATUS } from '../constants/generation';
import { EDGE_STATUS } from '../constants/canvas';
import {
  fetchHypothesisPromptBundle,
  generateHypothesisStream,
  type HypothesisLaneSession,
} from '../api/client';
import type { HypothesisGenerateApiPayload } from '../api/types';
import type { GenerationResult } from '../types/provider';
import {
  createPlaceholderGenerationSession,
  runFinalizeWithCatch,
} from './placeholder-generation-session';

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

    const lanePlaceholderIds: string[] = [];

    try {
      const bundle = await fetchHypothesisPromptBundle(workspacePayload);
      setCompiledPrompts(bundle.prompts);

      const prompt = bundle.prompts[0];
      if (!prompt) {
        setGenerationError('No prompt from server');
        setGenerating(false);
        setEdgeStatusBySource(nodeId, EDGE_STATUS.ERROR);
        return;
      }

      const provenanceCtx =
        bundle.provenance ?? provenanceFromHypothesisContext(genCtx);

      const placeholderResults: GenerationResult[] = [];
      const laneSessions: HypothesisLaneSession[] = [];

      for (const cred of bundle.generationContext.modelCredentials) {
        const placeholderId = crypto.randomUUID();
        const currentRunNumber = nextRunNumber(
          useGenerationStore.getState(),
          prompt.variantStrategyId,
        );
        const result: GenerationResult = {
          id: placeholderId,
          variantStrategyId: prompt.variantStrategyId,
          providerId: cred.providerId,
          status: GENERATION_STATUS.GENERATING,
          runId,
          runNumber: currentRunNumber,
          metadata: { model: cred.modelId },
        };
        addResult(result);
        placeholderResults.push(result);
        lanePlaceholderIds.push(placeholderId);

        const { callbacks, finalizeAfterStream } = createPlaceholderGenerationSession({
          placeholderId,
          prompt,
          providerId: cred.providerId,
          model: cred.modelId,
          mode: genCtx.agentMode,
          provenanceCtx,
          updateResult,
          correlationId: runId,
          onResultComplete: (id) => {
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
          },
        });

        laneSessions.push({
          callbacks,
          finalizeAfterStream: () =>
            runFinalizeWithCatch(finalizeAfterStream, placeholderId, updateResult),
        });
      }

      syncAfterGenerate(placeholderResults, nodeId);
      if (bundle.generationContext.agentMode === 'agentic') {
        const variantNodeId = useCanvasStore
          .getState()
          .variantNodeIdMap.get(prompt.variantStrategyId);
        if (variantNodeId) {
          useCanvasStore.getState().setRunInspectorVariant(variantNodeId);
        }
      }
      setTimeout(() => fitView({ duration: FIT_VIEW_DURATION_MS, padding: 0.15 }), FIT_VIEW_DELAY_MS);

      await generateHypothesisStream(workspacePayload, laneSessions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const id of lanePlaceholderIds) {
        const r = useGenerationStore.getState().results.find((x) => x.id === id);
        if (r?.status === GENERATION_STATUS.GENERATING) {
          updateResult(id, { status: GENERATION_STATUS.ERROR, error: msg });
        }
      }
      setGenerationError(msg);
      setEdgeStatusBySource(nodeId, EDGE_STATUS.ERROR);
    } finally {
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
            r.status === GENERATION_STATUS.ERROR,
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
