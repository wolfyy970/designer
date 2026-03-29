import { useCallback } from 'react';
import { normalizeError } from '../lib/error-utils';
import {
  useGenerationStore,
  nextRunNumber,
} from '../stores/generation-store';
import { GENERATION_STATUS } from '../constants/generation';
import { storage } from '../storage';
import { generate as apiGenerate } from '../api/client';
import type { CompiledPrompt } from '../types/compiler';
import type {
  AgenticCheckpoint,
  EvaluationContextPayload,
  EvaluationRoundSnapshot,
} from '../types/evaluation';
import type {
  GenerationResult,
  Provenance,
} from '../types/provider';
import type { ProvenanceContext } from '../types/provenance-context';

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
          // Single growing string — streaming token deltas are appended and flushed
          // to the store at animation-frame rate (not per-token) to avoid 50+ renders/sec.
          let activityText = '';
          let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
          let generatedCode = '';
          let liveFiles: Record<string, string> = {};
          let evaluationRounds: EvaluationRoundSnapshot[] = [];
          let agenticCheckpoint: AgenticCheckpoint | undefined;

          await apiGenerate(
            {
              prompt: prompt.prompt,
              providerId,
              modelId: options.model,
              supportsVision: options.supportsVision,
              mode: options.mode,
              thinkingLevel: options.thinkingLevel,
              evaluationContext: options.evaluationContext,
              evaluatorProviderId: options.evaluatorProviderId,
              evaluatorModelId: options.evaluatorModelId,
              agenticMaxRevisionRounds: options.agenticMaxRevisionRounds,
              agenticMinOverallScore: options.agenticMinOverallScore,
            },
            {
              onPhase: (phase) => {
                updateResult(placeholderId, { agenticPhase: phase });
              },
              onEvaluationProgress: (round, phase, message) => {
                updateResult(placeholderId, {
                  agenticPhase: 'evaluating',
                  evaluationStatus: [message ?? phase, `round ${round}`].filter(Boolean).join(' · '),
                });
              },
              onEvaluationReport: (_round, snapshot) => {
                evaluationRounds = [
                  ...evaluationRounds.filter((r) => r.round !== snapshot.round),
                  snapshot,
                ].sort((a, b) => a.round - b.round);
                updateResult(placeholderId, {
                  evaluationRounds,
                  evaluationSummary: snapshot.aggregate,
                  agenticPhase: 'evaluating',
                });
              },
              onRevisionRound: (round, brief) => {
                updateResult(placeholderId, {
                  agenticPhase: 'revising',
                  evaluationStatus: `Revision round ${round}`,
                  progressMessage: brief.length > 180 ? `${brief.slice(0, 180)}…` : brief,
                });
              },
              onCheckpoint: (checkpoint) => {
                agenticCheckpoint = checkpoint;
              },
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
              onTodos: (todos) => {
                updateResult(placeholderId, { liveTodos: todos });
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
                evaluation:
                  evaluationRounds.length > 0
                    ? {
                        rounds: evaluationRounds,
                        finalAggregate: evaluationRounds[evaluationRounds.length - 1]!.aggregate,
                      }
                    : undefined,
              checkpoint: agenticCheckpoint,
              };
              await storage.saveProvenance(placeholderId, provenance);
            }
          }

          updateResult(placeholderId, {
            id: placeholderId,
            status: GENERATION_STATUS.COMPLETE,
            agenticPhase: options.mode === 'agentic' ? 'complete' : undefined,
            evaluationStatus: undefined,
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
