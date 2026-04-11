import { debugAgentIngest } from '../lib/debug-agent-ingest';
import { AGENTIC_PHASE } from '../constants/agentic-stream';
import { GENERATION_STATUS } from '../constants/generation';
import type { GenerationResult, RunTraceEvent, SkillInfo, ThinkingTurnSlice } from '../types/provider';
import type { GenerateStreamCallbacks } from '../api/client';
import {
  clearTransientResultFields,
  normalizeEvalSnapshot,
  type PlaceholderGenerationSessionState,
  type PlaceholderRafBatchers,
} from './placeholder-session-state';
import {
  traceRowAgenticPhase,
  traceRowCheckpoint,
  traceRowEvaluationProgress,
  traceRowEvaluationReport,
  traceRowEvaluationWorker,
  traceRowRevisionRound,
} from './placeholder-trace-rows';
import { evaluationRoundSnapshotHasDegradedWorker, isEvaluatorWorkerDegraded } from '../types/evaluation';
import { normalizeError } from '../lib/error-utils';
import { streamPlaceholderDevDebug } from './placeholder-stream-dev-debug';

export function createPlaceholderStreamCallbacks(options: {
  placeholderId: string;
  traceLimit: number;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  scheduleTraceServerForward: (trace: RunTraceEvent) => void;
  state: PlaceholderGenerationSessionState;
  raf: PlaceholderRafBatchers;
}): GenerateStreamCallbacks {
  const { placeholderId, traceLimit, updateResult, scheduleTraceServerForward, state, raf } =
    options;

  const activatedSkills: SkillInfo[] = [];

  const pushTrace = (trace: RunTraceEvent) => {
    streamPlaceholderDevDebug(placeholderId, 'onTrace', {
      kind: trace.kind,
      label: trace.label.length > 80 ? `${trace.label.slice(0, 80)}…` : trace.label,
    });
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
      raf.thinking.cancelOnly();
      updateResult(placeholderId, { thinkingTurns: [...state.thinkingTurns] });
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
      streamPlaceholderDevDebug(placeholderId, 'onPhase', { phase });
      raf.streamingTool.cancelOnly();
      state.streamingToolPending = undefined;
      pushTrace(traceRowAgenticPhase(phase));
      updateResult(placeholderId, {
        agenticPhase: phase,
        ...clearTransientResultFields(),
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
      streamPlaceholderDevDebug(placeholderId, 'onEvaluationProgress', { round, phase, message });
      state.evalRoundLive = round;
      state.liveEvalWorkers = {};
      const trace = traceRowEvaluationProgress(round, phase, message);
      const nextStatus = trace.label;
      pushTrace(trace);
      updateResult(placeholderId, {
        agenticPhase: AGENTIC_PHASE.EVALUATING,
        evaluationStatus: nextStatus,
        progressMessage: nextStatus,
        liveEvalWorkers: {},
      });
    },
    onEvaluationReport: (_round, snapshot) => {
      streamPlaceholderDevDebug(placeholderId, 'onEvaluationReport', { round: snapshot.round });
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
          traceRowEvaluationReport(
            normalized.round,
            scoreLabel,
            hardFailsLen,
            evaluationRoundSnapshotHasDegradedWorker(normalized),
          ),
        );
        state.liveEvalWorkers = {};
        updateResult(placeholderId, {
          evaluationRounds: state.evaluationRounds,
          evaluationSummary: agg,
          agenticPhase: 'evaluating',
          progressMessage: 'Evaluator results received',
          liveEvalWorkers: {},
        });
      } catch (err) {
        debugAgentIngest({
          hypothesisId: 'E1',
          location: 'placeholder-stream-handlers.ts:onEvaluationReport:error',
          message: 'onEvaluationReport threw',
          data: { placeholderId, err: normalizeError(err) },
        });
        if (import.meta.env.DEV) {
          console.warn('[gen] onEvaluationReport failed', err);
        }
      }
    },
    onEvaluationWorkerDone: (round, rubric, workerReport) => {
      streamPlaceholderDevDebug(placeholderId, 'onEvaluationWorkerDone', {
        round,
        rubric,
        degraded: isEvaluatorWorkerDegraded(workerReport),
      });
      if (round !== state.evalRoundLive) return;
      state.liveEvalWorkers = { ...state.liveEvalWorkers, [rubric]: workerReport };
      updateResult(placeholderId, { liveEvalWorkers: { ...state.liveEvalWorkers } });
      pushTrace(traceRowEvaluationWorker(round, rubric, workerReport));
    },
    onRevisionRound: (round, brief) => {
      streamPlaceholderDevDebug(placeholderId, 'onRevisionRound', { round, briefLen: brief.length });
      pushTrace(traceRowRevisionRound(round));
      updateResult(placeholderId, {
        agenticPhase: 'revising',
        evaluationStatus: `Revision round ${round}`,
        progressMessage: brief.length > 180 ? `${brief.slice(0, 180)}…` : brief,
      });
    },
    onSkillsLoaded: (skills) => {
      streamPlaceholderDevDebug(placeholderId, 'onSkillsLoaded', { count: skills.length });
      updateResult(placeholderId, { liveSkills: skills });
    },
    onSkillActivated: (payload) => {
      streamPlaceholderDevDebug(placeholderId, 'onSkillActivated', { key: payload.key });
      const i = activatedSkills.findIndex((s) => s.key === payload.key);
      if (i >= 0) activatedSkills.splice(i, 1);
      activatedSkills.push(payload);
      updateResult(placeholderId, { liveActivatedSkills: [...activatedSkills] });
    },
    onCheckpoint: (checkpoint) => {
      streamPlaceholderDevDebug(placeholderId, 'onCheckpoint', { stopReason: checkpoint.stopReason });
      state.agenticCheckpoint = checkpoint;
      pushTrace(traceRowCheckpoint(checkpoint));
    },
    onActivity: (entry) => {
      const tid = state.currentModelTurnId || 1;
      streamPlaceholderDevDebug(placeholderId, 'onActivity', { chars: entry.length, turnId: tid });
      state.activityText += entry;
      state.activityByTurn = {
        ...state.activityByTurn,
        [tid]: (state.activityByTurn[tid] ?? '') + entry,
      };
      raf.activity.schedule();
    },
    onTrace: onTraceWithTurnHandling,
    onThinking: (turnId, delta) => {
      if (!delta) return;
      streamPlaceholderDevDebug(placeholderId, 'onThinking', { turnId, deltaLen: delta.length });
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
      raf.thinking.schedule();
    },
    onProgress: (status) => {
      streamPlaceholderDevDebug(placeholderId, 'onProgress', {
        status: status.length > 100 ? `${status.slice(0, 100)}…` : status,
      });
      updateResult(placeholderId, { progressMessage: status, lastActivityAt: Date.now() });
    },
    onStreamingTool: (toolName, streamedChars, done, toolPath) => {
      streamPlaceholderDevDebug(placeholderId, 'onStreamingTool', { toolName, streamedChars, done, toolPath });
      if (done) {
        state.streamingToolPending = undefined;
        raf.streamingTool.cancelOnly();
        updateResult(placeholderId, {
          streamingToolName: undefined,
          streamingToolPath: undefined,
          streamingToolChars: undefined,
          lastActivityAt: Date.now(),
        });
        return;
      }
      state.streamingToolPending = { toolName, streamedChars, toolPath };
      raf.streamingTool.schedule();
    },
    onCode: (code) => {
      streamPlaceholderDevDebug(placeholderId, 'onCode', { chars: code.length });
      state.generatedCode = code;
      state.pendingLiveCode = code;
      raf.code.schedule();
    },
    onFile: (path, content) => {
      streamPlaceholderDevDebug(placeholderId, 'onFile', { path, contentChars: content.length });
      state.liveFiles = { ...state.liveFiles, [path]: content };
      updateResult(placeholderId, {
        liveFiles: state.liveFiles,
        lastAgentFileAt: Date.now(),
      });
    },
    onPlan: (files) => {
      streamPlaceholderDevDebug(placeholderId, 'onPlan', { fileCount: files.length });
      updateResult(placeholderId, { liveFilesPlan: files });
    },
    onTodos: (todos) => {
      streamPlaceholderDevDebug(placeholderId, 'onTodos', { count: todos.length });
      updateResult(placeholderId, { liveTodos: todos });
    },
    onError: (error) => {
      streamPlaceholderDevDebug(placeholderId, 'onError', { error });
      updateResult(placeholderId, { status: GENERATION_STATUS.ERROR, error });
    },
  };
}
