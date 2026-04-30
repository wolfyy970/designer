import { GENERATION_STATUS } from '../constants/generation';
import type { GenerationResult } from '../types/provider';

/**
 * Snapshot storage is JSON-only. This helper is intentionally named so callers
 * use it only at snapshot serialization boundaries, not as a general clone.
 */
export function snapshotClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripEvaluationSummaryTrace(result: GenerationResult): void {
  if (!result.evaluationSummary) return;
  const evaluationSummary = { ...result.evaluationSummary };
  delete evaluationSummary.evaluatorTraces;
  result.evaluationSummary = evaluationSummary;
}

function stripEvaluationRoundPayloads(result: GenerationResult): void {
  if (!result.evaluationRounds?.length) return;
  result.evaluationRounds = result.evaluationRounds.map((round) => {
    const next = { ...round };
    delete next.files;
    if (next.aggregate) {
      const aggregate = { ...next.aggregate };
      delete aggregate.evaluatorTraces;
      next.aggregate = aggregate;
    }
    for (const slot of ['design', 'strategy', 'implementation', 'browser'] as const) {
      const report = next[slot];
      if (report && typeof report === 'object' && 'rawTrace' in report) {
        const { rawTrace: _rawTrace, ...rest } = report;
        void _rawTrace;
        next[slot] = rest as typeof report;
      }
    }
    return next;
  });
}

export function toRestorableGenerationResult(result: GenerationResult): GenerationResult {
  const copy: GenerationResult = {
    id: result.id,
    strategyId: result.strategyId,
    providerId: result.providerId,
    status: result.status,
    error: result.error,
    runId: result.runId,
    runNumber: result.runNumber,
    metadata: snapshotClone(result.metadata),
    progressMessage: result.progressMessage,
    activityLog: snapshotClone(result.activityLog),
    activityByTurn: snapshotClone(result.activityByTurn),
    thinkingTurns: snapshotClone(result.thinkingTurns),
    evaluationSummary: snapshotClone(result.evaluationSummary),
    evaluationRounds: snapshotClone(result.evaluationRounds),
  };

  if (copy.status === GENERATION_STATUS.GENERATING) {
    copy.status = GENERATION_STATUS.ERROR;
    copy.error = 'Generation stopped.';
  }

  stripEvaluationSummaryTrace(copy);
  stripEvaluationRoundPayloads(copy);
  return copy;
}
