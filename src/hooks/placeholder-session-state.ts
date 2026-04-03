import type {
  AggregatedEvaluationReport,
  AgenticCheckpoint,
  EvaluationRoundSnapshot,
} from '../types/evaluation';
import type { RunTraceEvent, ThinkingTurnSlice } from '../types/provider';

export interface PlaceholderGenerationSessionState {
  activityText: string;
  /** PI turn id for text_delta routing (0 until first `model_turn_start`). */
  currentModelTurnId: number;
  activityByTurn: Record<number, string>;
  thinkingTurns: ThinkingTurnSlice[];
  thinkingRafId: ReturnType<typeof requestAnimationFrame> | null;
  rafId: ReturnType<typeof requestAnimationFrame> | null;
  codeRafId: ReturnType<typeof requestAnimationFrame> | null;
  pendingLiveCode: string;
  generatedCode: string;
  liveFiles: Record<string, string>;
  liveTrace: RunTraceEvent[];
  evaluationRounds: EvaluationRoundSnapshot[];
  agenticCheckpoint: AgenticCheckpoint | undefined;
}

export function createInitialPlaceholderSessionState(): PlaceholderGenerationSessionState {
  return {
    activityText: '',
    currentModelTurnId: 0,
    activityByTurn: {},
    thinkingTurns: [],
    thinkingRafId: null,
    rafId: null,
    codeRafId: null,
    pendingLiveCode: '',
    generatedCode: '',
    liveFiles: {},
    liveTrace: [],
    evaluationRounds: [],
    agenticCheckpoint: undefined,
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
