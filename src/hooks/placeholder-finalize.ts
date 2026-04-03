import { debugAgentIngest } from '../lib/debug-agent-ingest';
import { GENERATION_STATUS } from '../constants/generation';
import { storage } from '../storage';
import type { CompiledPrompt } from '../types/compiler';
import type { GenerationResult, Provenance } from '../types/provider';
import type { ProvenanceContext } from '../types/provenance-context';
import { useGenerationStore } from '../stores/generation-store';
import type { PlaceholderGenerationSessionState } from './placeholder-session-state';

export function createPlaceholderFinalizeAfterStream(options: {
  placeholderId: string;
  prompt: CompiledPrompt;
  providerId: string;
  model: string;
  mode?: 'single' | 'agentic';
  provenanceCtx?: ProvenanceContext;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  flushAllPendingTraces: () => Promise<void>;
  state: PlaceholderGenerationSessionState;
  onResultComplete?: (placeholderId: string) => void;
}): () => Promise<void> {
  const {
    placeholderId,
    prompt,
    providerId,
    model,
    mode,
    provenanceCtx,
    updateResult,
    flushAllPendingTraces,
    state,
    onResultComplete,
  } = options;

  return async () => {
    if (state.thinkingRafId !== null) {
      cancelAnimationFrame(state.thinkingRafId);
      state.thinkingRafId = null;
    }
    const endMs = Date.now();
    state.thinkingTurns = state.thinkingTurns.map((t) =>
      t.endedAt == null ? { ...t, endedAt: endMs } : t,
    );
    updateResult(placeholderId, { thinkingTurns: [...state.thinkingTurns] });
    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
      updateResult(placeholderId, {
        activityLog: [state.activityText],
        activityByTurn: { ...state.activityByTurn },
        lastActivityAt: Date.now(),
      });
    }
    if (state.codeRafId !== null) {
      cancelAnimationFrame(state.codeRafId);
      state.codeRafId = null;
      updateResult(placeholderId, {
        liveCode: state.generatedCode,
        lastActivityAt: Date.now(),
      });
    }
    await flushAllPendingTraces();
    const current = useGenerationStore.getState().results.find((r) => r.id === placeholderId);
    if (current?.status === GENERATION_STATUS.ERROR) return;

    if (!state.generatedCode && Object.keys(state.liveFiles).length === 0) {
      updateResult(placeholderId, {
        status: GENERATION_STATUS.ERROR,
        error: 'Server returned no code.',
      });
      return;
    }

    if (state.generatedCode) await storage.saveCode(placeholderId, state.generatedCode);
    if (Object.keys(state.liveFiles).length > 0) {
      await storage.saveFiles(placeholderId, state.liveFiles);
    }

    for (const er of state.evaluationRounds) {
      if (er.files && Object.keys(er.files).length > 0) {
        await storage.saveRoundFiles(placeholderId, er.round, er.files);
      }
    }

    if (provenanceCtx) {
      const strategySnapshot = provenanceCtx.strategies[prompt.variantStrategyId];
      if (strategySnapshot) {
        const roundsWithoutFileBodies =
          state.evaluationRounds.length > 0
            ? state.evaluationRounds.map((er) => {
                const meta = { ...er };
                delete meta.files;
                return meta;
              })
            : [];
        const provenance: Provenance = {
          hypothesisSnapshot: strategySnapshot,
          designSystemSnapshot: provenanceCtx.designSystemSnapshot,
          compiledPrompt: prompt.prompt,
          provider: providerId,
          model,
          timestamp: new Date().toISOString(),
          evaluation:
            roundsWithoutFileBodies.length > 0
              ? {
                  rounds: roundsWithoutFileBodies,
                  finalAggregate: roundsWithoutFileBodies[roundsWithoutFileBodies.length - 1]!.aggregate,
                }
              : undefined,
          checkpoint: state.agenticCheckpoint,
        };
        await storage.saveProvenance(placeholderId, provenance);
      }
    }

    const roundsMetaOnly =
      state.evaluationRounds.length > 0
        ? state.evaluationRounds.map((er) => {
            const meta = { ...er };
            delete meta.files;
            return meta;
          })
        : undefined;

    const lastEvalAggregate =
      state.evaluationRounds.length > 0
        ? state.evaluationRounds[state.evaluationRounds.length - 1]!.aggregate
        : undefined;

    debugAgentIngest({
      hypothesisId: 'E2',
      location: 'placeholder-finalize.ts:finalize',
      message: 'finalize COMPLETE patch eval fields',
      data: {
        placeholderId,
        evaluationRoundsLen: state.evaluationRounds.length,
        hasLastAggregate: !!lastEvalAggregate,
      },
    });

    updateResult(placeholderId, {
      id: placeholderId,
      status: GENERATION_STATUS.COMPLETE,
      agenticPhase: mode === 'agentic' ? 'complete' : undefined,
      evaluationStatus: undefined,
      ...(roundsMetaOnly ? { evaluationRounds: roundsMetaOnly } : {}),
      ...(lastEvalAggregate ? { evaluationSummary: lastEvalAggregate } : {}),
      metadata: {
        model,
        completedAt: new Date().toISOString(),
      },
    });
    onResultComplete?.(placeholderId);
  };
}
