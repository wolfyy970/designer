import { AGENTIC_PHASE } from '../constants/agentic-stream';
import type { GenerateStreamCallbacks } from '../api/client';
import type { SkillInfo, RunTraceEvent } from '../types/provider';
import type { AgenticCheckpoint, AgenticPhase } from '../types/evaluation';
import { createPlaceholderTraceForwarder } from './placeholder-trace-forward';
import { traceRowAgenticPhase, traceRowCheckpoint } from './placeholder-trace-rows';
import {
  createInitialTaskStreamSessionState,
  createTaskStreamRafBatchers,
  type TaskStreamSessionState,
  type TaskStreamState,
} from './task-stream-state';

const DEFAULT_TRACE_LIMIT = 120;

function streamDevDebug(sessionId: string, message: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.debug(`(task-stream:${sessionId.slice(0, 8)})`, message, data ?? '');
}

/** Mark open thinking turns closed so the chip icon stops lying when the model moves on. */
function closeOpenThinkingTurnsOnTaskStream(
  state: Pick<TaskStreamSessionState, 'thinkingTurns'>,
): boolean {
  if (!state.thinkingTurns.some((t) => t.endedAt == null)) return false;
  const now = Date.now();
  state.thinkingTurns = state.thinkingTurns.map((t) =>
    t.endedAt == null ? { ...t, endedAt: now } : t,
  );
  return true;
}

export interface TaskStreamSessionOptions {
  /** Stable id for trace forwarding + RAF debug labels */
  sessionId: string;
  correlationId?: string;
  traceLimit?: number;
  onPatch: (patch: Partial<TaskStreamState>) => void;
}

/**
 * SSE callbacks + finalize for Pi task streams (incubate, inputs-gen) — agentic subset only,
 * no design persistence or eval rounds.
 */
export function createTaskStreamSession(options: TaskStreamSessionOptions): {
  callbacks: GenerateStreamCallbacks;
  finalize: () => Promise<void>;
} {
  const { sessionId, correlationId, traceLimit = DEFAULT_TRACE_LIMIT, onPatch } = options;

  const state: TaskStreamSessionState = createInitialTaskStreamSessionState();
  const raf = createTaskStreamRafBatchers(state, sessionId, onPatch);
  const trace = createPlaceholderTraceForwarder({
    resultId: sessionId,
    correlationId,
  });

  const activatedSkills: SkillInfo[] = [];

  const pushTrace = (t: RunTraceEvent) => {
    streamDevDebug(sessionId, 'onTrace', { kind: t.kind });
    state.liveTrace = [...state.liveTrace, t].slice(-traceLimit);
    onPatch({
      liveTrace: state.liveTrace,
      lastTraceAt: Date.parse(t.at) || Date.now(),
    });
    const next: Partial<TaskStreamState> = {};
    if (t.kind === 'tool_started') {
      next.activeToolName = t.toolName;
      next.activeToolPath = t.path;
    } else if (t.kind === 'tool_finished' || t.kind === 'tool_failed') {
      next.activeToolName = undefined;
      next.activeToolPath = undefined;
    }
    if (Object.keys(next).length) onPatch(next);
    trace.scheduleTraceServerForward(t);
  };

  const onTraceWithTurnHandling: GenerateStreamCallbacks['onTrace'] = (t) => {
    if (t.kind === 'model_turn_start') {
      raf.thinking.cancelOnly();
      onPatch({ thinkingTurns: [...state.thinkingTurns] });
      const tid = t.turnId ?? state.currentModelTurnId + 1;
      state.currentModelTurnId = tid;
      const now = Date.now();
      state.thinkingTurns = state.thinkingTurns.map((row) =>
        row.turnId < tid && row.endedAt == null ? { ...row, endedAt: now } : row,
      );
      const startedAt = Number.isFinite(Date.parse(t.at)) ? Date.parse(t.at) : now;
      if (!state.thinkingTurns.some((row) => row.turnId === tid)) {
        state.thinkingTurns = [...state.thinkingTurns, { turnId: tid, text: '', startedAt }];
      }
      onPatch({ thinkingTurns: [...state.thinkingTurns] });
    }
    pushTrace(t);
  };

  const callbacks: GenerateStreamCallbacks = {
    onPhase: (phase: AgenticPhase) => {
      streamDevDebug(sessionId, 'onPhase', { phase });
      raf.streamingTool.cancelOnly();
      state.streamingToolPending = undefined;
      pushTrace(traceRowAgenticPhase(phase));
      onPatch({
        agenticPhase: phase,
        streamingToolName: undefined,
        streamingToolPath: undefined,
        streamingToolChars: undefined,
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
    onSkillsLoaded: (skills) => {
      streamDevDebug(sessionId, 'onSkillsLoaded', { count: skills.length });
      onPatch({ liveSkills: skills });
    },
    onSkillActivated: (payload) => {
      streamDevDebug(sessionId, 'onSkillActivated', { key: payload.key });
      const i = activatedSkills.findIndex((s) => s.key === payload.key);
      if (i >= 0) activatedSkills.splice(i, 1);
      activatedSkills.push(payload);
      onPatch({ liveActivatedSkills: [...activatedSkills] });
    },
    onCheckpoint: (checkpoint: AgenticCheckpoint) => {
      streamDevDebug(sessionId, 'onCheckpoint', { stopReason: checkpoint.stopReason });
      pushTrace(traceRowCheckpoint(checkpoint));
    },
    onActivity: (entry) => {
      const tid = state.currentModelTurnId || 1;
      streamDevDebug(sessionId, 'onActivity', { chars: entry.length, turnId: tid });
      state.activityText += entry;
      state.streamedModelChars += entry.length;
      state.activityByTurn = {
        ...state.activityByTurn,
        [tid]: (state.activityByTurn[tid] ?? '') + entry,
      };
      const closed = closeOpenThinkingTurnsOnTaskStream(state);
      onPatch({
        streamMode: 'narrating',
        ...(closed ? { thinkingTurns: [...state.thinkingTurns] } : {}),
      });
      raf.activity.schedule();
    },
    onTrace: onTraceWithTurnHandling,
    onThinking: (turnId, delta) => {
      if (!delta) return;
      streamDevDebug(sessionId, 'onThinking', { turnId, deltaLen: delta.length });
      const existing = state.thinkingTurns.find((row) => row.turnId === turnId);
      const startedAt = existing?.startedAt ?? Date.now();
      const next = {
        turnId,
        text: (existing?.text ?? '') + delta,
        startedAt,
        endedAt: existing?.endedAt,
      };
      state.thinkingTurns = [...state.thinkingTurns.filter((row) => row.turnId !== turnId), next].sort(
        (a, b) => a.turnId - b.turnId,
      );
      state.streamedModelChars += delta.length;
      onPatch({ streamMode: 'thinking' });
      raf.thinking.schedule();
    },
    onProgress: (status) => {
      streamDevDebug(sessionId, 'onProgress', {
        status: status.length > 100 ? `${status.slice(0, 100)}…` : status,
      });
      onPatch({ progressMessage: status, lastActivityAt: Date.now() });
    },
    onStreamingTool: (toolName, streamedChars, done, toolPath) => {
      streamDevDebug(sessionId, 'onStreamingTool', { toolName, streamedChars, done, toolPath });
      if (done) {
        state.streamingToolPending = undefined;
        raf.streamingTool.cancelOnly();
        onPatch({
          streamingToolName: undefined,
          streamingToolPath: undefined,
          streamingToolChars: undefined,
          lastActivityAt: Date.now(),
        });
        return;
      }
      const prev =
        state.streamingToolPending?.toolName === toolName
          ? state.streamingToolPending.streamedChars ?? 0
          : 0;
      const delta = Math.max(0, streamedChars - prev);
      if (delta > 0) state.streamedModelChars += delta;
      state.streamingToolPending = { toolName, streamedChars, toolPath };
      const closed = closeOpenThinkingTurnsOnTaskStream(state);
      onPatch({
        streamMode: 'tool',
        ...(closed ? { thinkingTurns: [...state.thinkingTurns] } : {}),
        ...(delta > 0 ? { streamedModelChars: state.streamedModelChars } : {}),
      });
      raf.streamingTool.schedule();
    },
    onCode: (code) => {
      streamDevDebug(sessionId, 'onCode', { chars: code.length });
      state.pendingLiveCode = code;
      raf.code.schedule();
    },
    onFile: (path, content) => {
      streamDevDebug(sessionId, 'onFile', { path, contentChars: content.length });
      onPatch({
        lastWrittenFilePath: path,
        lastActivityAt: Date.now(),
      });
    },
    onPlan: (files) => {
      streamDevDebug(sessionId, 'onPlan', { fileCount: files.length });
      onPatch({ plannedFileCount: files.length });
    },
    onTodos: (todos) => {
      streamDevDebug(sessionId, 'onTodos', { count: todos.length });
      onPatch({ liveTodosCount: todos.filter((t) => t.status !== 'completed').length });
    },
    onError: (error) => {
      streamDevDebug(sessionId, 'onError', { error });
      onPatch({ status: 'error', error });
    },
  };

  async function finalize(): Promise<void> {
    raf.activity.flushPending();
    raf.thinking.flushPending();
    raf.code.flushPending();
    raf.streamingTool.flushPending();
    await trace.flushAllPending();
    raf.logDevSummary?.();
  }

  return { callbacks, finalize };
}
