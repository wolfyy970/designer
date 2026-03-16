import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useSpecStore } from '../stores/spec-store';
import { useCompilerStore, findVariantStrategy } from '../stores/compiler-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { compileVariantPrompts } from '../services/compiler';
import { useGenerate, type ProvenanceContext } from './useGenerate';
import { collectDesignSystemInputs } from '../lib/canvas-graph';
import { generateId, now } from '../lib/utils';
import { DEFAULT_COMPILER_PROVIDER, FIT_VIEW_DELAY_MS, FIT_VIEW_DURATION_MS } from '../lib/constants';
import { GENERATION_STATUS } from '../constants/generation';
import { EDGE_STATUS } from '../constants/canvas';

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

interface ConnectedModel {
  providerId: string;
  modelId: string;
}

/** Read all Model nodes connected to a hypothesis node (imperative, from store snapshot). */
function getConnectedModels(nodeId: string): ConnectedModel[] {
  const { nodes, edges } = useCanvasStore.getState();
  const models: ConnectedModel[] = [];
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const source = nodes.find((n) => n.id === e.source);
    if (source?.type !== 'model') continue;
    const providerId = (source.data.providerId as string) || DEFAULT_COMPILER_PROVIDER;
    const modelId = source.data.modelId as string;
    if (!modelId) continue;
    models.push({ providerId, modelId });
  }
  return models;
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

  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Clear progress when generation ends
  useEffect(() => {
    if (!isGenerating) setGenerationProgress(null);
  }, [isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!strategy) return;

    const connectedModels = getConnectedModels(nodeId);
    if (connectedModels.length === 0) return;

    // Read agentic settings from node data at generation time
    const { nodes: canvasNodes, edges: canvasEdges } = useCanvasStore.getState();
    const thisNode = canvasNodes.find((n) => n.id === nodeId);
    const agentMode = (thisNode?.data?.agentMode as 'single' | 'agentic' | undefined) ?? 'single';
    const thinkingLevel = thisNode?.data?.thinkingLevel as 'off' | 'minimal' | 'low' | 'medium' | 'high' | undefined;

    // Collect design system content from connected DesignSystem nodes
    const { content: dsContent, images: dsImages } =
      collectDesignSystemInputs(canvasNodes, canvasEdges, nodeId);

    // Build a single-variant dimension map for prompt compilation
    const filteredMap = {
      id: generateId(),
      specId: spec.id,
      dimensions: [],
      variants: [strategy],
      generatedAt: now(),
      compilerModel: 'merged',
    };

    const prompts = compileVariantPrompts(spec, filteredMap, dsContent, dsImages);
    setCompiledPrompts(prompts);

    setEdgeStatusBySource(nodeId, EDGE_STATUS.PROCESSING);
    setGenerationError(null);

    // Build provenance context
    const provenanceCtx: ProvenanceContext = {
      strategies: {
        [strategy.id]: {
          name: strategy.name,
          hypothesis: strategy.hypothesis,
          rationale: strategy.rationale,
          dimensionValues: strategy.dimensionValues,
        },
      },
      designSystemSnapshot: dsContent || undefined,
    };

    // Multi-model: generate one design per connected Model node.
    // Manage the isGenerating flag externally so it stays true across
    // the entire loop (no flicker between sequential model calls).
    setGenerating(true);
    setGenerationProgress({ completed: 0, total: connectedModels.length });

    let hasFitView = false;

    const allResults = await Promise.all(
      connectedModels.map((model) =>
        generate(
          model.providerId,
          prompts,
          { model: model.modelId, mode: agentMode, thinkingLevel },
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
      setGenerationError(
        errorCount === connectedModels.length
          ? 'Generation failed'
          : `${errorCount} of ${connectedModels.length} failed`,
      );
    }

    clearVariantNodeIdMap();
    setEdgeStatusBySource(nodeId, EDGE_STATUS.COMPLETE);
  }, [
    strategy,
    nodeId,
    spec,
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
