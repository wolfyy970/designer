import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useQuery } from '@tanstack/react-query';
import { useSpecStore } from '../stores/spec-store';
import { useCompilerStore, findVariantStrategy } from '../stores/compiler-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { compileVariantPrompts } from '../services/compiler';
import { useGenerate } from './useGenerate';
import { generateId, now } from '../lib/utils';
import {
  buildHypothesisGenerationContext,
  evaluationPayloadFromHypothesisContext,
  provenanceFromHypothesisContext,
} from '../workspace/workspace-session';
import { FIT_VIEW_DELAY_MS, FIT_VIEW_DURATION_MS } from '../lib/constants';
import { GENERATION_STATUS } from '../constants/generation';
import { EDGE_STATUS } from '../constants/canvas';
import { PROMPT_DEFAULTS } from '../lib/prompts/shared-defaults';

// Version stacking: when the user changes model and regenerates,
// results accumulate within the same variant node (navigable with
// version arrows). No forking — one variant node per hypothesis strategy.

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
 *
 * Discovers connected Model nodes at generation time. If multiple
 * Model nodes are connected, generates one design per model. All
 * results share the same variantStrategyId and stack on one variant
 * node — the user navigates versions to compare models.
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
  // Check if THIS hypothesis is generating (not global)
  const isGenerating = useGenerationStore((s) =>
    s.results.some((r) => r.variantStrategyId === strategyId && r.status === GENERATION_STATUS.GENERATING),
  );

  const syncAfterGenerate = useCanvasStore((s) => s.syncAfterGenerate);
  const setEdgeStatusBySource = useCanvasStore((s) => s.setEdgeStatusBySource);
  const setEdgeStatusByTarget = useCanvasStore((s) => s.setEdgeStatusByTarget);
  const clearVariantNodeIdMap = useCanvasStore((s) => s.clearVariantNodeIdMap);

  const generate = useGenerate();

  const { data: variantPromptData } = useQuery({
    queryKey: ['prompt', 'variant'],
    queryFn: () => fetch('/api/prompts/variant').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Clear progress when generation ends
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

    // Build a single-variant dimension map for prompt compilation
    const filteredMap = {
      id: generateId(),
      specId: spec.id,
      dimensions: [],
      variants: [strategy],
      generatedAt: now(),
      compilerModel: 'merged',
    };

    const variantTemplate = variantPromptData?.body ?? PROMPT_DEFAULTS['variant'];
    const prompts = compileVariantPrompts(
      spec,
      filteredMap,
      variantTemplate,
      genCtx.designSystemContent,
      [...genCtx.designSystemImages],
    );
    setCompiledPrompts(prompts);

    setEdgeStatusBySource(nodeId, EDGE_STATUS.PROCESSING);
    setGenerationError(null);

    const provenanceCtx = provenanceFromHypothesisContext(genCtx);
    const evaluationContext = evaluationPayloadFromHypothesisContext(genCtx);

    // Multi-model: generate one design per connected Model node.
    // Manage the isGenerating flag externally so it stays true across
    // the entire loop (no flicker between sequential model calls).
    setGenerating(true);
    setGenerationProgress({ completed: 0, total: genCtx.modelCredentials.length });

    let hasFitView = false;

    const allResults = await Promise.all(
      genCtx.modelCredentials.map((model) =>
        generate(
          model.providerId,
          prompts,
          {
            model: model.modelId,
            mode: genCtx.agentMode,
            thinkingLevel: genCtx.thinkingLevel,
            evaluationContext,
          },
          {
            onPlaceholdersReady: (phs) => {
              syncAfterGenerate(phs, nodeId);
              if (!hasFitView) {
                hasFitView = true;
                setTimeout(() => fitView({ duration: FIT_VIEW_DURATION_MS, padding: 0.15 }), FIT_VIEW_DELAY_MS);
              }
            },
            onResultComplete: (placeholderId) => {
              setGenerationProgress((prev) =>
                prev ? { ...prev, completed: prev.completed + 1 } : null,
              );
              const result = useGenerationStore.getState().results.find(
                (r) => r.id === placeholderId,
              );
              if (result) {
                const variantNodeId = useCanvasStore.getState().variantNodeIdMap.get(
                  result.variantStrategyId,
                );
                if (variantNodeId) {
                  setEdgeStatusByTarget(variantNodeId, EDGE_STATUS.COMPLETE);
                }
              }
            },
          },
          provenanceCtx,
          { manageGenerating: false },
        ),
      ),
    );

    const stillGenerating = useGenerationStore.getState().results.some(
      (r) => r.status === GENERATION_STATUS.GENERATING,
    );
    if (!stillGenerating) setGenerating(false);

    const errorCount = allResults
      .flat()
      .filter((ph) => {
        const r = useGenerationStore.getState().results.find((x) => x.id === ph.id);
        return r?.status === GENERATION_STATUS.ERROR;
      }).length;

    if (errorCount > 0) {
      const n = genCtx.modelCredentials.length;
      setGenerationError(
        errorCount === n
          ? 'Generation failed'
          : `${errorCount} of ${n} failed`,
      );
    }

    clearVariantNodeIdMap();
    setEdgeStatusBySource(nodeId, EDGE_STATUS.COMPLETE);
  }, [
    strategy,
    nodeId,
    spec,
    variantPromptData,
    setCompiledPrompts,
    setGenerating,
    generate,
    syncAfterGenerate,
    clearVariantNodeIdMap,
    setEdgeStatusBySource,
    setEdgeStatusByTarget,
    fitView,
  ]);

  return { handleGenerate, generationProgress, generationError };
}
