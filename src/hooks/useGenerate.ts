import { useCallback } from 'react';
import { normalizeError } from '../lib/error-utils';
import {
  useGenerationStore,
  nextRunNumber,
} from '../stores/generation-store';
import { GENERATION_STATUS } from '../constants/generation';
import { storage } from '../storage';
import { getPrompt } from '../stores/prompt-store';
import { generate as apiGenerate } from '../api/client';
import type { CompiledPrompt } from '../types/compiler';
import type {
  GenerationResult,
  Provenance,
} from '../types/provider';

export interface ProvenanceContext {
  strategies: Record<
    string,
    {
      name: string;
      hypothesis: string;
      rationale: string;
      dimensionValues: Record<string, string>;
    }
  >;
  designSystemSnapshot?: string;
}

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
          // Single growing string — streaming token deltas are appended and flushed
          // to the store at animation-frame rate (not per-token) to avoid 50+ renders/sec.
          let activityText = '';
          let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
          let generatedCode = '';
          let liveFiles: Record<string, string> = {};

          await apiGenerate(
            {
              prompt: prompt.prompt,
              providerId,
              modelId: options.model,
              promptOverrides: {
                genSystemHtml: getPrompt('genSystemHtml'),
                genSystemHtmlAgentic: getPrompt('genSystemHtmlAgentic'),
              },
              supportsVision: options.supportsVision,
              mode: options.mode,
              thinkingLevel: options.thinkingLevel,
            },
            {
              onActivity: (entry) => {
                activityText += entry;
                if (rafId === null) {
                  rafId = requestAnimationFrame(() => {
                    updateResult(placeholderId, { activityLog: [activityText] });
                    rafId = null;
                  });
                }
              },
              onProgress: (status) => {
                updateResult(placeholderId, { progressMessage: status });
              },
              onCode: (code) => {
                generatedCode = code;
                updateResult(placeholderId, { liveCode: code });
              },
              onFile: (path, content) => {
                liveFiles = { ...liveFiles, [path]: content };
                updateResult(placeholderId, { liveFiles });
              },
              onPlan: (files) => {
                updateResult(placeholderId, { liveFilesPlan: files });
              },
              onError: (error) => {
                updateResult(placeholderId, { status: GENERATION_STATUS.ERROR, error });
              },
            },
          );

          if (!generatedCode && Object.keys(liveFiles).length === 0) {
            updateResult(placeholderId, {
              status: GENERATION_STATUS.ERROR,
              error: 'Server returned no code.',
            });
            return;
          }

          if (generatedCode) await storage.saveCode(placeholderId, generatedCode);
          if (Object.keys(liveFiles).length > 0) await storage.saveFiles(placeholderId, liveFiles);

          if (provenanceCtx) {
            const strategySnapshot =
              provenanceCtx.strategies[prompt.variantStrategyId];
            if (strategySnapshot) {
              const provenance: Provenance = {
                hypothesisSnapshot: strategySnapshot,
                designSystemSnapshot: provenanceCtx.designSystemSnapshot,
                compiledPrompt: prompt.prompt,
                provider: providerId,
                model: options.model,
                timestamp: new Date().toISOString(),
              };
              await storage.saveProvenance(placeholderId, provenance);
            }
          }

          updateResult(placeholderId, {
            id: placeholderId,
            status: GENERATION_STATUS.COMPLETE,
            metadata: {
              model: options.model,
              completedAt: new Date().toISOString(),
            },
          });
          callbacks?.onResultComplete?.(placeholderId);
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
