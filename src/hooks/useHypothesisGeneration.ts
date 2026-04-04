import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useSpecStore } from '../stores/spec-store';
import { useCompilerStore, findStrategy } from '../stores/compiler-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { useAppConfig } from './useAppConfig';
import { GENERATION_STATUS } from '../constants/generation';
import { runHypothesisGenerateFlow, type GenerationProgress } from './hypothesis-generate-flow';
import { useConnectedModel } from './useConnectedModel';

interface HypothesisGenerationParams {
  nodeId: string;
  strategyId: string;
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
  const { data: appConfig } = useAppConfig();
  const lockdown = appConfig?.lockdown === true;
  const { supportsVision } = useConnectedModel(nodeId);

  const spec = useSpecStore((s) => s.spec);
  const strategy = useCompilerStore(
    (s) => findStrategy(s.incubationPlans, strategyId),
  );
  const setCompiledPrompts = useCompilerStore((s) => s.setCompiledPrompts);
  const setGenerating = useGenerationStore((s) => s.setGenerating);
  const addResult = useGenerationStore((s) => s.addResult);
  const updateResult = useGenerationStore((s) => s.updateResult);

  const isGenerating = useGenerationStore((s) =>
    s.results.some((r) => r.strategyId === strategyId && r.status === GENERATION_STATUS.GENERATING),
  );

  const syncAfterGenerate = useCanvasStore((s) => s.syncAfterGenerate);
  const setEdgeStatusBySource = useCanvasStore((s) => s.setEdgeStatusBySource);
  const setEdgeStatusByTarget = useCanvasStore((s) => s.setEdgeStatusByTarget);
  const clearPreviewNodeIdMap = useCanvasStore((s) => s.clearPreviewNodeIdMap);

  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGenerating) setGenerationProgress(null);
  }, [isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!strategy) return;
    await runHypothesisGenerateFlow({
      nodeId,
      strategyId,
      strategy,
      spec,
      lockdown,
      supportsVision,
      fitView,
      setCompiledPrompts,
      setGenerating,
      addResult,
      updateResult,
      syncAfterGenerate,
      setEdgeStatusBySource,
      setEdgeStatusByTarget,
      clearPreviewNodeIdMap,
      setGenerationProgress,
      setGenerationError,
    });
  }, [
    strategy,
    nodeId,
    spec,
    setCompiledPrompts,
    setGenerating,
    addResult,
    updateResult,
    syncAfterGenerate,
    clearPreviewNodeIdMap,
    setEdgeStatusBySource,
    setEdgeStatusByTarget,
    fitView,
    strategyId,
    lockdown,
    supportsVision,
  ]);

  return { handleGenerate, generationProgress, generationError };
}
