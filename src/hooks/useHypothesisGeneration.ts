import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useSpecStore } from '../stores/spec-store';
import { useCompilerStore, findVariantStrategy } from '../stores/compiler-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { useAppConfig } from './useAppConfig';
import { GENERATION_STATUS } from '../constants/generation';
import { runHypothesisGenerateFlow, type GenerationProgress } from './hypothesis-generate-flow';

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
    await runHypothesisGenerateFlow({
      nodeId,
      strategyId,
      strategy,
      spec,
      lockdown,
      fitView,
      setCompiledPrompts,
      setGenerating,
      addResult,
      updateResult,
      syncAfterGenerate,
      setEdgeStatusBySource,
      setEdgeStatusByTarget,
      clearVariantNodeIdMap,
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
    clearVariantNodeIdMap,
    setEdgeStatusBySource,
    setEdgeStatusByTarget,
    fitView,
    strategyId,
    lockdown,
  ]);

  return { handleGenerate, generationProgress, generationError };
}
