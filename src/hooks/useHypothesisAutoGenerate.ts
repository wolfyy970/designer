import { useCallback, useState } from 'react';
import { incubateStream } from '../api/client';
import { buildIncubateInputs } from '../lib/canvas-graph';
import { normalizeError } from '../lib/error-utils';
import { useCanvasStore } from '../stores/canvas-store';
import { useGenerationStore } from '../stores/generation-store';
import { useIncubatorStore, findStrategy } from '../stores/incubator-store';
import {
  getActivePromptOverrides,
  spreadPromptOverrides,
  usePromptOverridesStore,
} from '../stores/prompt-overrides-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import type { HypothesisStrategy } from '../types/incubator';
import { useConnectedModel } from './useConnectedModel';

export interface UseHypothesisAutoGenerateOptions {
  nodeId: string;
  strategyId: string;
}

/**
 * Runs the same incubation LLM as the Incubator (count=1) and writes fields into an existing strategy.
 * Passes sibling hypotheses as `existingStrategies` so the model proposes something differentiated.
 */
export function useHypothesisAutoGenerate({
  nodeId,
  strategyId,
}: UseHypothesisAutoGenerateOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incubatorId = useWorkspaceDomainStore(
    (s) => s.hypotheses[nodeId]?.incubatorId ?? null,
  );
  const { providerId, modelId, supportsVision } = useConnectedModel(nodeId);
  const hasModel = Boolean(providerId && modelId);
  const canRun = Boolean(
    strategyId && incubatorId && hasModel,
  );

  const generate = useCallback(async () => {
    if (!strategyId || !incubatorId || !providerId || !modelId) return;
    const nodes = useCanvasStore.getState().nodes;
    const edges = useCanvasStore.getState().edges;
    const spec = useSpecStore.getState().spec;
    const results = useGenerationStore.getState().results;
    const wiring = useWorkspaceDomainStore.getState().incubatorWirings[incubatorId] ?? null;

    const { partialSpec, referenceDesigns } = await buildIncubateInputs(
      nodes,
      edges,
      spec,
      incubatorId,
      results,
      wiring,
    );

    const incubationPlans = useIncubatorStore.getState().incubationPlans;
    const existingStrategies: HypothesisStrategy[] = [];
    const hypotheses = useWorkspaceDomainStore.getState().hypotheses;
    for (const h of Object.values(hypotheses)) {
      if (h.incubatorId !== incubatorId || h.placeholder) continue;
      const row = findStrategy(incubationPlans, h.strategyId);
      if (row) existingStrategies.push(row);
    }

    setIsGenerating(true);
    setError(null);
    try {
      const map = await incubateStream(
        {
          spec: partialSpec,
          providerId,
          modelId,
          referenceDesigns,
          supportsVision,
          promptOptions: { count: 1, existingStrategies },
          ...spreadPromptOverrides(
            getActivePromptOverrides(usePromptOverridesStore.getState().overrides),
          ),
        },
        undefined,
      );
      const generated = map.hypotheses[0];
      if (!generated) {
        setError('No hypothesis was returned');
        return;
      }
      useIncubatorStore.getState().updateStrategy(strategyId, {
        name: generated.name,
        hypothesis: generated.hypothesis,
        rationale: generated.rationale,
        measurements: generated.measurements,
        dimensionValues: generated.dimensionValues,
      });
      useIncubatorStore.getState().appendStrategiesToNode(incubatorId, {
        ...map,
        hypotheses: [],
      });
    } catch (err) {
      setError(normalizeError(err, 'Hypothesis generation failed'));
    } finally {
      setIsGenerating(false);
    }
  }, [incubatorId, modelId, providerId, strategyId, supportsVision]);

  return {
    generate,
    isGenerating,
    error,
    canRun,
    hasModel,
    hasIncubator: incubatorId != null,
  };
}
