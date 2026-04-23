import type { RunTraceEvent, SkillInfo, ThinkingTurnSlice } from '../types/provider';
import {
  batchedRafUpdater,
  type PlaceholderRafBatch,
  type RafDevStats,
} from './placeholder-session-state';

/** Lightweight UI state for Pi task streams (incubate, inputs-gen) — no design artifacts. */
export type TaskStreamStatus = 'idle' | 'streaming' | 'complete' | 'error';

export interface TaskStreamState {
  status: TaskStreamStatus;
  error?: string;
  progressMessage?: string;
  /** Latest assistant activity line (after RAF flush). */
  activityLog?: string[];
  activityByTurn?: Record<number, string>;
  thinkingTurns?: ThinkingTurnSlice[];
  streamingToolName?: string;
  streamingToolPath?: string;
  streamingToolChars?: number;
  activeToolName?: string;
  activeToolPath?: string;
  liveSkills?: SkillInfo[];
  liveActivatedSkills?: SkillInfo[];
  liveTrace?: RunTraceEvent[];
  /** Agentic phase from SSE (`building`, `complete`, …). */
  agenticPhase?: string;
  lastActivityAt?: number;
  lastTraceAt?: number;
  /** Tail of streamed `code` SSE (agentic HTML / snippets). */
  codePreview?: string;
  /** Last file path from `file` SSE. */
  lastWrittenFilePath?: string;
  /** Count of planned files from `plan` SSE. */
  plannedFileCount?: number;
  /** Open todos from `todos` SSE. */
  liveTodosCount?: number;
  /**
   * Cumulative characters the model has streamed back (answer + thinking).
   * Used for a live "~N tok" signal in the monitor; convert via
   * `estimateTextTokens` or `Math.round(chars / 3.6)` for display.
   */
  streamedModelChars?: number;
}

/** In-memory buffers for RAF + trace ring (mirrors placeholder session, minus eval/design). */
export interface TaskStreamSessionState {
  activityText: string;
  currentModelTurnId: number;
  activityByTurn: Record<number, string>;
  thinkingTurns: ThinkingTurnSlice[];
  streamingToolPending?: { toolName: string; streamedChars: number; toolPath?: string };
  pendingLiveCode: string;
  liveTrace: RunTraceEvent[];
  /** Running sum of answer + thinking characters the model has streamed back. */
  streamedModelChars: number;
}

export function createInitialTaskStreamSessionState(): TaskStreamSessionState {
  return {
    activityText: '',
    currentModelTurnId: 0,
    activityByTurn: {},
    thinkingTurns: [],
    pendingLiveCode: '',
    liveTrace: [],
    streamedModelChars: 0,
  };
}

export function createInitialTaskStreamState(status: TaskStreamStatus = 'idle'): TaskStreamState {
  return { status };
}

export interface TaskStreamRafBatchers {
  activity: PlaceholderRafBatch;
  thinking: PlaceholderRafBatch;
  code: PlaceholderRafBatch;
  streamingTool: PlaceholderRafBatch;
  logDevSummary?: () => void;
}

export function createTaskStreamRafBatchers(
  state: TaskStreamSessionState,
  sessionId: string,
  onPatch: (patch: Partial<TaskStreamState>) => void,
): TaskStreamRafBatchers {
  const short = sessionId.slice(0, 8);
  const mkStats = (name: string): RafDevStats | undefined =>
    import.meta.env.DEV ? { name, schedules: 0, framesExecuted: 0, cancelDiscards: 0 } : undefined;
  const activityStats = mkStats('activity');
  const thinkingStats = mkStats('thinking');
  const codeStats = mkStats('code');
  const streamingToolStats = mkStats('streamingTool');

  const logDevSummary =
    import.meta.env.DEV
      ? () => {
          console.debug(`(raf:task:${short})`, {
            activity: activityStats,
            thinking: thinkingStats,
            code: codeStats,
            streamingTool: streamingToolStats,
          });
        }
      : undefined;

  return {
    activity: batchedRafUpdater(() => {
      onPatch({
        activityLog: [state.activityText],
        activityByTurn: { ...state.activityByTurn },
        lastActivityAt: Date.now(),
        streamedModelChars: state.streamedModelChars,
      });
    }, activityStats),
    thinking: batchedRafUpdater(() => {
      onPatch({
        thinkingTurns: [...state.thinkingTurns],
        lastActivityAt: Date.now(),
        streamedModelChars: state.streamedModelChars,
      });
    }, thinkingStats),
    code: batchedRafUpdater(() => {
      const tail = state.pendingLiveCode;
      const preview =
        tail.length > 512 ? `…${tail.slice(-(512 - 1))}` : tail;
      onPatch({
        codePreview: preview || undefined,
        lastActivityAt: Date.now(),
      });
    }, codeStats),
    streamingTool: batchedRafUpdater(() => {
      const pending = state.streamingToolPending;
      if (!pending) return;
      onPatch({
        streamingToolName: pending.toolName,
        streamingToolPath: pending.toolPath,
        streamingToolChars: pending.streamedChars,
        lastActivityAt: Date.now(),
      });
    }, streamingToolStats),
    logDevSummary,
  };
}
