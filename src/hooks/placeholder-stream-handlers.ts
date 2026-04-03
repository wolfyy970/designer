import { debugAgentIngest } from '../lib/debug-agent-ingest';
import { AGENTIC_PHASE } from '../constants/agentic-stream';
import { GENERATION_STATUS } from '../constants/generation';
import type { GenerationResult, RunTraceEvent, ThinkingTurnSlice } from '../types/provider';
import type { GenerateStreamCallbacks } from '../api/client';
import {
  normalizeEvalSnapshot,
  type PlaceholderGenerationSessionState,
} from './placeholder-session-state';
import {
  traceRowAgenticPhase,
  traceRowCheckpoint,
  traceRowEvaluationProgress,
  traceRowEvaluationReport,
  traceRowRevisionRound,
} from './placeholder-trace-rows';

export function createPlaceholderStreamCallbacks(options: {
  placeholderId: string;
  traceLimit: number;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  scheduleTraceServerForward: (trace: RunTraceEvent) => void;
  state: PlaceholderGenerationSessionState;
}): GenerateStreamCallbacks {
  const { placeholderId, traceLimit, updateResult, scheduleTraceServerForward, state } = options;

  const pushTrace = (trace: RunTraceEvent) => {
    state.liveTrace = [...state.liveTrace, trace].slice(-traceLimit);
    const next: Partial<GenerationResult> = {
      liveTrace: state.liveTrace,
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

  const onTraceWithTurnHandling = (trace: RunTraceEvent) => {
    if (trace.kind === 'model_turn_start') {
      if (state.thinkingRafId !== null) {
        cancelAnimationFrame(state.thinkingRafId);
        state.thinkingRafId = null;
        updateResult(placeholderId, { thinkingTurns: [...state.thinkingTurns] });
      }
      const tid = trace.turnId ?? state.currentModelTurnId + 1;
      state.currentModelTurnId = tid;
      const now = Date.now();
      state.thinkingTurns = state.thinkingTurns.map((t) =>
        t.turnId < tid && t.endedAt == null ? { ...t, endedAt: now } : t,
      );
      const startedAt = Number.isFinite(Date.parse(trace.at)) ? Date.parse(trace.at) : now;
      if (!state.thinkingTurns.some((t) => t.turnId === tid)) {
        state.thinkingTurns = [...state.thinkingTurns, { turnId: tid, text: '', startedAt }];
      }
      updateResult(placeholderId, { thinkingTurns: [...state.thinkingTurns] });
    }
    pushTrace(trace);
  };

  return {
    onPhase: (phase) => {
      pushTrace(traceRowAgenticPhase(phase));
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
      const trace = traceRowEvaluationProgress(round, phase, message);
      const nextStatus = trace.label;
      pushTrace(trace);
      updateResult(placeholderId, {
        agenticPhase: AGENTIC_PHASE.EVALUATING,
        evaluationStatus: nextStatus,
        progressMessage: nextStatus,
      });
    },
    onEvaluationReport: (_round, snapshot) => {
      debugAgentIngest({
        hypothesisId: 'E1',
        location: 'placeholder-stream-handlers.ts:onEvaluationReport',
        message: 'client evaluation_report received',
        data: {
          placeholderId,
          round: snapshot.round,
          hasAggregate: !!snapshot.aggregate,
          overallType: typeof snapshot.aggregate?.overallScore,
        },
      });
      try {
        const normalized = normalizeEvalSnapshot(snapshot);
        state.evaluationRounds = [
          ...state.evaluationRounds.filter((r) => r.round !== normalized.round),
          normalized,
        ].sort((a, b) => a.round - b.round);
        const agg = normalized.aggregate;
        const score = agg.overallScore;
        const scoreLabel =
          typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : '—';
        const hardFailsLen = agg.hardFails?.length ?? 0;
        pushTrace(
          traceRowEvaluationReport(normalized.round, scoreLabel, hardFailsLen),
        );
        updateResult(placeholderId, {
          evaluationRounds: state.evaluationRounds,
          evaluationSummary: agg,
          agenticPhase: 'evaluating',
          progressMessage: 'Evaluator results received',
        });
      } catch (err) {
        debugAgentIngest({
          hypothesisId: 'E1',
          location: 'placeholder-stream-handlers.ts:onEvaluationReport:error',
          message: 'onEvaluationReport threw',
          data: { placeholderId, err: String(err) },
        });
        if (import.meta.env.DEV) {
          console.warn('[gen] onEvaluationReport failed', err);
        }
      }
    },
    onRevisionRound: (round, brief) => {
      pushTrace(traceRowRevisionRound(round));
      updateResult(placeholderId, {
        agenticPhase: 'revising',
        evaluationStatus: `Revision round ${round}`,
        progressMessage: brief.length > 180 ? `${brief.slice(0, 180)}…` : brief,
      });
    },
    onCheckpoint: (checkpoint) => {
      state.agenticCheckpoint = checkpoint;
      pushTrace(traceRowCheckpoint(checkpoint));
    },
    onActivity: (entry) => {
      state.activityText += entry;
      const tid = state.currentModelTurnId || 1;
      state.activityByTurn = {
        ...state.activityByTurn,
        [tid]: (state.activityByTurn[tid] ?? '') + entry,
      };
      if (state.rafId === null) {
        state.rafId = requestAnimationFrame(() => {
          updateResult(placeholderId, {
            activityLog: [state.activityText],
            activityByTurn: { ...state.activityByTurn },
            lastActivityAt: Date.now(),
          });
          state.rafId = null;
        });
      }
    },
    onTrace: onTraceWithTurnHandling,
    onThinking: (turnId, delta) => {
      if (!delta) return;
      const existing = state.thinkingTurns.find((t) => t.turnId === turnId);
      const startedAt = existing?.startedAt ?? Date.now();
      const next: ThinkingTurnSlice = {
        turnId,
        text: (existing?.text ?? '') + delta,
        startedAt,
        endedAt: existing?.endedAt,
      };
      state.thinkingTurns = [...state.thinkingTurns.filter((t) => t.turnId !== turnId), next].sort(
        (a, b) => a.turnId - b.turnId,
      );
      if (state.thinkingRafId === null) {
        state.thinkingRafId = requestAnimationFrame(() => {
          updateResult(placeholderId, {
            thinkingTurns: [...state.thinkingTurns],
            lastActivityAt: Date.now(),
          });
          state.thinkingRafId = null;
        });
      }
    },
    onProgress: (status) => {
      updateResult(placeholderId, { progressMessage: status });
    },
    onCode: (code) => {
      state.generatedCode = code;
      state.pendingLiveCode = code;
      if (state.codeRafId === null) {
        state.codeRafId = requestAnimationFrame(() => {
          updateResult(placeholderId, {
            liveCode: state.pendingLiveCode,
            lastActivityAt: Date.now(),
          });
          state.codeRafId = null;
        });
      }
    },
    onFile: (path, content) => {
      state.liveFiles = { ...state.liveFiles, [path]: content };
      updateResult(placeholderId, {
        liveFiles: state.liveFiles,
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
}
