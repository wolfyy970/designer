import { useCallback } from 'react';
import { normalizeError } from '../lib/error-utils';
import {
  useGenerationStore,
  nextRunNumber,
} from '../stores/generation-store';
import { GENERATION_STATUS } from '../constants/generation';
import { generate as apiGenerate } from '../api/client';
import type { CompiledPrompt } from '../types/compiler';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { GenerationResult } from '../types/provider';
import type { ProvenanceContext } from '../types/provenance-context';
import {
  createPlaceholderGenerationSession,
  runFinalizeWithCatch,
} from './placeholder-generation-session';

export type { ProvenanceContext };

/**
 * Shared generation orchestration hook.
 * Results accumulate across runs (no reset). Code is stored in IndexedDB.
 */
export function useGenerate() {
  const addResult = useGenerationStore((s) => s.addResult);
  const updateResult = useGenerationStore((s) => s.updateResult);
  const setGenerating = useGenerationStore((s) => s.setGenerating);

  const generate = useCallback(
    async (
      providerId: string,
      prompts: CompiledPrompt[],
      options: {
        model: string;
        supportsVision?: boolean;
        mode?: 'single' | 'agentic';
        thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
        evaluationContext?: EvaluationContextPayload;
        evaluatorProviderId?: string;
        evaluatorModelId?: string;
        agenticMaxRevisionRounds?: number;
        agenticMinOverallScore?: number;
      },
      callbacks?: {
        onPlaceholdersReady?: (placeholders: GenerationResult[]) => void;
        onResultComplete?: (placeholderId: string) => void;
      },
      provenanceCtx?: ProvenanceContext,
      config?: { manageGenerating?: boolean },
    ): Promise<GenerationResult[]> => {
      if (prompts.length === 0) return [];

      const manage = config?.manageGenerating !== false;
      const runId = crypto.randomUUID();
      if (manage) setGenerating(true);

      const placeholderMap = new Map<string, string>();
      const placeholders = prompts.map((prompt) => {
        const placeholderId = crypto.randomUUID();
        placeholderMap.set(prompt.variantStrategyId, placeholderId);
        const currentRunNumber = nextRunNumber(
          useGenerationStore.getState(),
          prompt.variantStrategyId,
        );
        const result: GenerationResult = {
          id: placeholderId,
          variantStrategyId: prompt.variantStrategyId,
          providerId,
          status: GENERATION_STATUS.GENERATING,
          runId,
          runNumber: currentRunNumber,
          metadata: { model: options.model },
        };
        addResult(result);
        return result;
      });

      callbacks?.onPlaceholdersReady?.(placeholders);

      const generateOne = async (prompt: CompiledPrompt) => {
        const placeholderId = placeholderMap.get(prompt.variantStrategyId)!;
        try {
          const { callbacks: streamCallbacks, finalizeAfterStream } =
            createPlaceholderGenerationSession({
              placeholderId,
              prompt,
              providerId,
              model: options.model,
              mode: options.mode,
              provenanceCtx,
              updateResult,
              onResultComplete: callbacks?.onResultComplete,
              correlationId: runId,
            });

          await apiGenerate(
            {
              prompt: prompt.prompt,
              providerId,
              modelId: options.model,
              correlationId: runId,
              supportsVision: options.supportsVision,
              mode: options.mode,
              thinkingLevel: options.thinkingLevel,
              evaluationContext: options.evaluationContext,
              evaluatorProviderId: options.evaluatorProviderId,
              evaluatorModelId: options.evaluatorModelId,
              agenticMaxRevisionRounds: options.agenticMaxRevisionRounds,
              agenticMinOverallScore: options.agenticMinOverallScore,
            },
            streamCallbacks,
          );

          await runFinalizeWithCatch(finalizeAfterStream, placeholderId, updateResult);
        } catch (err) {
          updateResult(placeholderId, {
            status: GENERATION_STATUS.ERROR,
            error: normalizeError(err, 'Generation failed'),
          });
        }
      };

      await Promise.all(prompts.map((prompt) => generateOne(prompt)));

      if (manage) {
        const stillGenerating = useGenerationStore.getState().results.some(
          (r) => r.status === GENERATION_STATUS.GENERATING,
        );
        if (!stillGenerating) setGenerating(false);
      }
      return placeholders;
    },
    [addResult, updateResult, setGenerating],
  );

  return generate;
}
