import { useCallback, useRef, useState } from 'react';
import { incubateStream } from '../api/client';
import { buildIncubateInputs } from '../lib/canvas-graph';
import { normalizeError } from '../lib/error-utils';
import { useCanvasStore } from '../stores/canvas-store';
import { useGenerationStore } from '../stores/generation-store';
import { useIncubatorStore, findStrategy } from '../stores/incubator-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import type { HypothesisStrategy } from '../types/incubator';
import { useConnectedModel } from './useConnectedModel';
import { createTaskStreamSession } from './task-stream-session';
import { createInitialTaskStreamState, type TaskStreamState } from './task-stream-state';

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
  const [taskStreamState, setTaskStreamState] = useState<TaskStreamState>(() =>
    createInitialTaskStreamState('idle'),
  );
  /** Prevents overlapping runs before React state updates (double-click / Strict Mode edge cases). */
  const generatingRef = useRef(false);

  const incubatorId = useWorkspaceDomainStore(
    (s) => s.hypotheses[nodeId]?.incubatorId ?? null,
  );
  const { providerId, modelId, supportsVision } = useConnectedModel(nodeId);
  const hasModel = Boolean(providerId && modelId);
  const canRun = Boolean(
    strategyId && incubatorId && hasModel,
  );

  const generate = useCallback(async () => {
    if (generatingRef.current) return;
    if (!strategyId || !incubatorId || !providerId || !modelId) return;
    generatingRef.current = true;
    try {
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
      setTaskStreamState({ ...createInitialTaskStreamState(), status: 'streaming' });
      let session: ReturnType<typeof createTaskStreamSession> | undefined;
      try {
        const taskSession = createTaskStreamSession({
          sessionId: `hypo-auto-${nodeId}-${strategyId}-${Date.now()}`,
          correlationId: crypto.randomUUID(),
          onPatch: (patch) => setTaskStreamState((prev) => ({ ...prev, ...patch })),
        });
        session = taskSession;
        const map = await incubateStream(
          {
            spec: partialSpec,
            providerId,
            modelId,
            referenceDesigns,
            supportsVision,
            promptOptions: { count: 1, existingStrategies },
          },
          { agentic: taskSession.callbacks },
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
        void session?.finalize();
        setTaskStreamState(createInitialTaskStreamState('idle'));
        setIsGenerating(false);
      }
    } catch (err) {
      setError(normalizeError(err, 'Hypothesis generation failed'));
    } finally {
      generatingRef.current = false;
    }
  }, [incubatorId, modelId, nodeId, providerId, strategyId, supportsVision]);

  return {
    generate,
    isGenerating,
    error,
    taskStreamState,
    canRun,
    hasModel,
    hasIncubator: incubatorId != null,
  };
}
