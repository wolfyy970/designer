import type {
  AggregatedEvaluationReport,
  AgenticCheckpoint,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../types/evaluation';
import type { GenerationResult, RunTraceEvent, ThinkingTurnSlice } from '../types/provider';

/** Dev-only RAF coalescing stats (see finalize `logDevSummary`). */
export interface RafDevStats {
  name: string;
  /** Times `schedule` started a new requestAnimationFrame. */
  schedules: number;
  /** Times the flush callback ran (from rAF or `flushPending`). */
  framesExecuted: number;
  /** Times `cancelOnly` discarded a pending frame without flushing. */
  cancelDiscards: number;
}

/** Batches rapid stream updates to one React commit per animation frame. */
export function batchedRafUpdater(
  flush: () => void,
  stats?: RafDevStats,
): {
  schedule: () => void;
  cancelOnly: () => void;
  /** If a frame was scheduled, cancel it and run flush once (sync). */
  flushPending: () => void;
} {
  let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  return {
    schedule() {
      if (rafId !== null) return;
      if (stats && import.meta.env.DEV) stats.schedules += 1;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (stats && import.meta.env.DEV) stats.framesExecuted += 1;
        flush();
      });
    },
    cancelOnly() {
      if (rafId !== null) {
        if (stats && import.meta.env.DEV) stats.cancelDiscards += 1;
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    flushPending() {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
      if (stats && import.meta.env.DEV) stats.framesExecuted += 1;
      flush();
    },
  };
}

export type PlaceholderRafBatch = ReturnType<typeof batchedRafUpdater>;

export interface PlaceholderRafBatchers {
  activity: PlaceholderRafBatch;
  thinking: PlaceholderRafBatch;
  code: PlaceholderRafBatch;
  streamingTool: PlaceholderRafBatch;
  /** Dev: log RAF batching stats for this session (call after `flushPending` in finalize). */
  logDevSummary?: () => void;
}

export function createPlaceholderRafBatchers(
  state: PlaceholderGenerationSessionState,
  placeholderId: string,
  updateResult: (id: string, patch: Partial<GenerationResult>) => void,
): PlaceholderRafBatchers {
  const short = placeholderId.slice(0, 8);
  const mkStats = (name: string): RafDevStats | undefined =>
    import.meta.env.DEV ? { name, schedules: 0, framesExecuted: 0, cancelDiscards: 0 } : undefined;
  const activityStats = mkStats('activity');
  const thinkingStats = mkStats('thinking');
  const codeStats = mkStats('code');
  const streamingToolStats = mkStats('streamingTool');

  const logDevSummary =
    import.meta.env.DEV
      ? () => {
          console.debug(`[raf:${short}]`, {
            activity: activityStats,
            thinking: thinkingStats,
            code: codeStats,
            streamingTool: streamingToolStats,
          });
        }
      : undefined;

  return {
    activity: batchedRafUpdater(() => {
      updateResult(placeholderId, {
        activityLog: [state.activityText],
        activityByTurn: { ...state.activityByTurn },
        lastActivityAt: Date.now(),
      });
    }, activityStats),
    thinking: batchedRafUpdater(() => {
      updateResult(placeholderId, {
        thinkingTurns: [...state.thinkingTurns],
        lastActivityAt: Date.now(),
      });
    }, thinkingStats),
    code: batchedRafUpdater(() => {
      updateResult(placeholderId, {
        liveCode: state.pendingLiveCode,
        lastActivityAt: Date.now(),
      });
    }, codeStats),
    streamingTool: batchedRafUpdater(() => {
      const pending = state.streamingToolPending;
      if (!pending) return;
      updateResult(placeholderId, {
        streamingToolName: pending.toolName,
        streamingToolPath: pending.toolPath,
        streamingToolChars: pending.streamedChars,
        lastActivityAt: Date.now(),
      });
    }, streamingToolStats),
    logDevSummary,
  };
}

export const TRANSIENT_RESULT_FIELDS = [
  'streamingToolName',
  'streamingToolPath',
  'streamingToolChars',
  'activeToolName',
  'activeToolPath',
  'liveEvalWorkers',
] as const satisfies readonly (keyof GenerationResult)[];

export function clearTransientResultFields(): Partial<GenerationResult> {
  return Object.fromEntries(
    TRANSIENT_RESULT_FIELDS.map((key) => [key, undefined]),
  ) as Partial<GenerationResult>;
}

export interface PlaceholderGenerationSessionState {
  activityText: string;
  /** PI turn id for text_delta routing (0 until first `model_turn_start`). */
  currentModelTurnId: number;
  activityByTurn: Record<number, string>;
  thinkingTurns: ThinkingTurnSlice[];
  streamingToolPending?: { toolName: string; streamedChars: number; toolPath?: string };
  pendingLiveCode: string;
  generatedCode: string;
  liveFiles: Record<string, string>;
  liveTrace: RunTraceEvent[];
  evaluationRounds: EvaluationRoundSnapshot[];
  agenticCheckpoint: AgenticCheckpoint | undefined;
  /** Round number from latest `evaluation_progress` (ignore worker_done from older rounds). */
  evalRoundLive: number;
  /** Partial rubric reports during in-flight evaluation rounds */
  liveEvalWorkers: Partial<Record<EvaluatorRubricId, EvaluatorWorkerReport>>;
}

export function createInitialPlaceholderSessionState(): PlaceholderGenerationSessionState {
  return {
    activityText: '',
    currentModelTurnId: 0,
    activityByTurn: {},
    thinkingTurns: [],
    pendingLiveCode: '',
    generatedCode: '',
    liveFiles: {},
    liveTrace: [],
    evaluationRounds: [],
    agenticCheckpoint: undefined,
    evalRoundLive: 0,
    liveEvalWorkers: {},
  };
}

function fallbackAggregate(reason: string): AggregatedEvaluationReport {
  return {
    overallScore: 0,
    normalizedScores: {},
    hardFails: [],
    prioritizedFixes: [`[high] ${reason}`],
    shouldRevise: true,
    revisionBrief: '',
  };
}

export function normalizeEvalSnapshot(snapshot: EvaluationRoundSnapshot): EvaluationRoundSnapshot {
  const raw = snapshot.aggregate;
  if (raw && typeof raw.overallScore === 'number' && Number.isFinite(raw.overallScore)) {
    return snapshot;
  }
  return {
    ...snapshot,
    aggregate: fallbackAggregate(
      'Evaluation aggregate missing or invalid after SSE — check server payload and client schema.',
    ),
  };
}
