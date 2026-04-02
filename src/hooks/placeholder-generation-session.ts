import { normalizeError } from '../lib/error-utils';
import { AGENTIC_PHASE } from '../constants/agentic-stream';
import { GENERATION_STATUS } from '../constants/generation';
import { storage } from '../storage';
import type { CompiledPrompt } from '../types/compiler';
import type { AgenticCheckpoint, EvaluationRoundSnapshot } from '../types/evaluation';
import type { GenerationResult, Provenance, RunTraceEvent } from '../types/provider';
import type { ProvenanceContext } from '../types/provenance-context';
import { postTraceEvents, type GenerateStreamCallbacks } from '../api/client';
import { useGenerationStore } from '../stores/generation-store';

const DEFAULT_TRACE_LIMIT = 120;
const TRACE_SERVER_FLUSH_MS = 280;
const TRACE_SERVER_BUFFER_MAX = 200;

export interface PlaceholderSessionOptions {
  placeholderId: string;
  prompt: CompiledPrompt;
  providerId: string;
  model: string;
  mode?: 'single' | 'agentic';
  provenanceCtx?: ProvenanceContext;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  traceLimit?: number;
  onResultComplete?: (placeholderId: string) => void;
  /** Ties forwarded run-trace rows to the generate / hypothesis stream */
  correlationId?: string;
}

/**
 * SSE callbacks + post-stream persistence for one generation placeholder (single lane).
 */
export function createPlaceholderGenerationSession(
  options: PlaceholderSessionOptions,
): {
  callbacks: GenerateStreamCallbacks;
  finalizeAfterStream: () => Promise<void>;
} {
  const {
    placeholderId,
    prompt,
    providerId,
    model,
    mode,
    provenanceCtx,
    updateResult,
    traceLimit = DEFAULT_TRACE_LIMIT,
    onResultComplete,
    correlationId: sessionCorrelationId,
  } = options;

  let pendingServerTraces: RunTraceEvent[] = [];
  let traceFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let traceForwardWarned = false;

  async function flushTraceToServer(): Promise<void> {
    if (traceFlushTimer != null) {
      clearTimeout(traceFlushTimer);
      traceFlushTimer = null;
    }
    if (pendingServerTraces.length === 0) return;
    const batch = pendingServerTraces.splice(0, pendingServerTraces.length);
    const ok = await postTraceEvents({
      events: batch,
      resultId: placeholderId,
      correlationId: sessionCorrelationId,
    });
    if (!ok && batch.length > 0) {
      pendingServerTraces = [...batch, ...pendingServerTraces].slice(-TRACE_SERVER_BUFFER_MAX);
      if (!traceForwardWarned && import.meta.env.DEV) {
        traceForwardWarned = true;
        console.warn(
          '[observability] Trace ingest failed (is the API running?). Events are buffered briefly.',
        );
      }
    }
  }

  function scheduleTraceServerForward(trace: RunTraceEvent) {
    pendingServerTraces.push(trace);
    if (pendingServerTraces.length > TRACE_SERVER_BUFFER_MAX) {
      pendingServerTraces = pendingServerTraces.slice(-TRACE_SERVER_BUFFER_MAX);
    }
    if (traceFlushTimer != null) clearTimeout(traceFlushTimer);
    traceFlushTimer = setTimeout(() => {
      traceFlushTimer = null;
      void flushTraceToServer();
    }, TRACE_SERVER_FLUSH_MS);
  }

  let activityText = '';
  let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  let generatedCode = '';
  let liveFiles: Record<string, string> = {};
  let liveTrace: RunTraceEvent[] = [];
  let evaluationRounds: EvaluationRoundSnapshot[] = [];
  let agenticCheckpoint: AgenticCheckpoint | undefined;

  const pushTrace = (trace: RunTraceEvent) => {
    liveTrace = [...liveTrace, trace].slice(-traceLimit);
    const next: Partial<GenerationResult> = {
      liveTrace,
      lastTraceAt: Date.parse(trace.at) || Date.now(),
    };
    if (trace.kind === 'tool_started') {
      next.activeToolName = trace.toolName;
      next.activeToolPath = trace.path;
    } else if (trace.kind === 'tool_finished' || trace.kind === 'tool_failed') {
      next.activeToolName = undefined;
      next.activeToolPath = undefined;
    }
    updateResult(placeholderId, next);
    scheduleTraceServerForward(trace);
  };

  const callbacks: GenerateStreamCallbacks = {
    onPhase: (phase) => {
      pushTrace({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'phase',
        label:
          phase === AGENTIC_PHASE.BUILDING
            ? 'Build phase'
            : phase === AGENTIC_PHASE.EVALUATING
              ? 'Evaluation phase'
              : phase === AGENTIC_PHASE.REVISING
                ? 'Revision phase'
                : 'Run complete',
        phase,
        status: 'info',
      });
      updateResult(placeholderId, {
        agenticPhase: phase,
        activeToolName: undefined,
        activeToolPath: undefined,
        progressMessage:
          phase === AGENTIC_PHASE.EVALUATING
            ? 'Running evaluators…'
            : phase === AGENTIC_PHASE.REVISING
              ? 'Applying revision brief…'
              : phase === AGENTIC_PHASE.COMPLETE
                ? 'Finalizing…'
                : undefined,
      });
    },
    onEvaluationProgress: (round, phase, message) => {
      const nextStatus = [message ?? phase, `round ${round}`].filter(Boolean).join(' · ');
      pushTrace({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'evaluation_progress',
        label: nextStatus,
        phase: AGENTIC_PHASE.EVALUATING,
        round,
        status: 'info',
      });
      updateResult(placeholderId, {
        agenticPhase: AGENTIC_PHASE.EVALUATING,
        evaluationStatus: nextStatus,
        progressMessage: nextStatus,
      });
    },
    onEvaluationReport: (_round, snapshot) => {
      evaluationRounds = [
        ...evaluationRounds.filter((r) => r.round !== snapshot.round),
        snapshot,
      ].sort((a, b) => a.round - b.round);
      pushTrace({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'evaluation_report',
        label: `Evaluation round ${snapshot.round} scored ${snapshot.aggregate.overallScore.toFixed(1)}`,
        phase: 'evaluating',
        round: snapshot.round,
        status: snapshot.aggregate.hardFails.length > 0 ? 'warning' : 'success',
      });
      updateResult(placeholderId, {
        evaluationRounds,
        evaluationSummary: snapshot.aggregate,
        agenticPhase: 'evaluating',
        progressMessage: 'Evaluator results received',
      });
    },
    onRevisionRound: (round, brief) => {
      pushTrace({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'revision_round',
        label: `Revision round ${round}`,
        phase: 'revising',
        round,
        status: 'warning',
      });
      updateResult(placeholderId, {
        agenticPhase: 'revising',
        evaluationStatus: `Revision round ${round}`,
        progressMessage: brief.length > 180 ? `${brief.slice(0, 180)}…` : brief,
      });
    },
    onCheckpoint: (checkpoint) => {
      agenticCheckpoint = checkpoint;
      pushTrace({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'checkpoint',
        label: `Checkpoint: ${checkpoint.stopReason ?? 'complete'}`,
        phase: 'complete',
        status: checkpoint.stopReason === 'satisfied' ? 'success' : 'info',
      });
    },
    onActivity: (entry) => {
      activityText += entry;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          updateResult(placeholderId, {
            activityLog: [activityText],
            lastActivityAt: Date.now(),
          });
          rafId = null;
        });
      }
    },
    onTrace: (trace) => {
      pushTrace(trace);
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
      updateResult(placeholderId, {
        liveFiles,
        lastAgentFileAt: Date.now(),
      });
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
  };

  const finalizeAfterStream = async () => {
    for (let attempt = 0; attempt < 5 && pendingServerTraces.length > 0; attempt++) {
      await flushTraceToServer();
    }
    const current = useGenerationStore.getState().results.find((r) => r.id === placeholderId);
    if (current?.status === GENERATION_STATUS.ERROR) return;

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
      const strategySnapshot = provenanceCtx.strategies[prompt.variantStrategyId];
      if (strategySnapshot) {
        const provenance: Provenance = {
          hypothesisSnapshot: strategySnapshot,
          designSystemSnapshot: provenanceCtx.designSystemSnapshot,
          compiledPrompt: prompt.prompt,
          provider: providerId,
          model,
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
      agenticPhase: mode === 'agentic' ? 'complete' : undefined,
      evaluationStatus: undefined,
      metadata: {
        model,
        completedAt: new Date().toISOString(),
      },
    });
    onResultComplete?.(placeholderId);
  };

  return { callbacks, finalizeAfterStream };
}

export async function runFinalizeWithCatch(
  finalizeAfterStream: () => Promise<void>,
  placeholderId: string,
  updateResult: (id: string, patch: Partial<GenerationResult>) => void,
): Promise<void> {
  try {
    await finalizeAfterStream();
  } catch (err) {
    updateResult(placeholderId, {
      status: GENERATION_STATUS.ERROR,
      error: normalizeError(err, 'Generation failed'),
    });
  }
}
