import type {
  AggregatedEvaluationReport,
  AgenticCheckpoint,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../types/evaluation';
import type { GenerationResult, RunTraceEvent, ThinkingTurnSlice } from '../types/provider';

/** Batches rapid stream updates to one React commit per animation frame. */
export function batchedRafUpdater(flush: () => void): {
  schedule: () => void;
  cancelOnly: () => void;
  /** If a frame was scheduled, cancel it and run flush once (sync). */
  flushPending: () => void;
} {
  let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  return {
    schedule() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flush();
      });
    },
    cancelOnly() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    flushPending() {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
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
}

export function createPlaceholderRafBatchers(
  state: PlaceholderGenerationSessionState,
  placeholderId: string,
  updateResult: (id: string, patch: Partial<GenerationResult>) => void,
): PlaceholderRafBatchers {
  return {
    activity: batchedRafUpdater(() => {
      updateResult(placeholderId, {
        activityLog: [state.activityText],
        activityByTurn: { ...state.activityByTurn },
        lastActivityAt: Date.now(),
      });
    }),
    thinking: batchedRafUpdater(() => {
      updateResult(placeholderId, {
        thinkingTurns: [...state.thinkingTurns],
        lastActivityAt: Date.now(),
      });
    }),
    code: batchedRafUpdater(() => {
      updateResult(placeholderId, {
        liveCode: state.pendingLiveCode,
        lastActivityAt: Date.now(),
      });
    }),
    streamingTool: batchedRafUpdater(() => {
      const pending = state.streamingToolPending;
      if (!pending) return;
      updateResult(placeholderId, {
        streamingToolName: pending.toolName,
        streamingToolPath: pending.toolPath,
        streamingToolChars: pending.streamedChars,
        lastActivityAt: Date.now(),
      });
    }),
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
