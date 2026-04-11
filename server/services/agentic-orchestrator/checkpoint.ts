import {
  EVALUATOR_RUBRIC_IDS,
  type AgenticCheckpoint,
  type AgenticStopReason,
  type AggregatedEvaluationReport,
  type EvaluationRoundSnapshot,
} from '../../../src/types/evaluation.ts';
import type { EvaluationRoundHistoryEntry } from '../../lib/agentic-revision-user.ts';
import { rubricMeansFromNormalizedScores } from '../../lib/evaluation-revision-gate.ts';
import type { AgenticOrchestratorResult } from './types.ts';
import { CHECKPOINT_TODO_SUMMARY_MAX } from './types.ts';

export function appendEvaluationRoundHistory(
  snapshot: EvaluationRoundSnapshot,
  history: EvaluationRoundHistoryEntry[],
): void {
  history.push({
    round: snapshot.round,
    rubricMeans: rubricMeansFromNormalizedScores(snapshot.aggregate.normalizedScores),
    overallScore: snapshot.aggregate.overallScore,
    hardFailCount: snapshot.aggregate.hardFails.length,
    normalizedScores: { ...snapshot.aggregate.normalizedScores },
  });
}

export function buildCheckpoint(
  files: Record<string, string>,
  rounds: EvaluationRoundSnapshot[],
  opts: {
    stopReason: AgenticStopReason;
    revisionAttempts: number;
    revisionBriefApplied?: string;
  },
): AgenticCheckpoint {
  const finalRound = rounds[rounds.length - 1];
  const completedTodos = finalRound
    ? [...(finalRound.design?.findings.map((f) => f.summary) ?? [])].slice(0, CHECKPOINT_TODO_SUMMARY_MAX)
    : [];
  return {
    totalRounds: rounds.length,
    filesWritten: Object.keys(files),
    finalTodosSummary: completedTodos.join('; ') || 'No findings recorded',
    revisionBriefApplied: opts.revisionBriefApplied,
    completedAt: new Date().toISOString(),
    stopReason: opts.stopReason,
    revisionAttempts: opts.revisionAttempts,
  };
}

export function mergeSeedWithDesign(
  designFiles: Record<string, string>,
  sandboxSeedFiles?: Record<string, string>,
): Record<string, string> {
  const sand = sandboxSeedFiles && Object.keys(sandboxSeedFiles).length > 0 ? sandboxSeedFiles : {};
  return { ...sand, ...designFiles };
}

export function agenticResult(
  files: Record<string, string>,
  rounds: EvaluationRoundSnapshot[],
  snapshot: EvaluationRoundSnapshot,
  checkpointOpts: {
    stopReason: AgenticStopReason;
    revisionAttempts: number;
    revisionBriefApplied?: string;
  },
  emittedFilePaths: string[],
): AgenticOrchestratorResult {
  return {
    files,
    rounds,
    finalAggregate: snapshot.aggregate,
    checkpoint: buildCheckpoint(files, rounds, checkpointOpts),
    emittedFilePaths,
  };
}

export function buildSkippedEvalAggregate(): AggregatedEvaluationReport {
  const normalizedScores = Object.fromEntries(
    EVALUATOR_RUBRIC_IDS.map((id) => [id, 0]),
  ) as Record<string, number>;
  return {
    overallScore: 0,
    normalizedScores,
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: '',
  };
}

/** Pi build finished without running evaluator workers (single pass). */
export function agenticBuildOnlyResult(
  files: Record<string, string>,
  emittedFilePaths: string[],
): AgenticOrchestratorResult {
  const aggregate = buildSkippedEvalAggregate();
  return {
    files,
    rounds: [],
    finalAggregate: aggregate,
    checkpoint: buildCheckpoint(files, [], {
      stopReason: 'build_only',
      revisionAttempts: 0,
    }),
    emittedFilePaths,
  };
}
