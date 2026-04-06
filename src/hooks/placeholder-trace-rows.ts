import { AGENTIC_PHASE } from '../constants/agentic-stream';
import {
  isEvaluatorWorkerDegraded,
  type AgenticCheckpoint,
  type AgenticPhase,
  type EvaluatorRubricId,
  type EvaluatorWorkerReport,
} from '../types/evaluation';
import type { RunTraceEvent } from '../types/provider';

const RUBRIC_TRACE_LABEL: Record<EvaluatorRubricId, string> = {
  design: 'Design',
  strategy: 'Strategy',
  implementation: 'Implementation',
  browser: 'Browser',
};

const WORKER_TRACE_DETAIL_MAX = 400;

function averageRubricScore(report: EvaluatorWorkerReport): number | null {
  const vals = Object.values(report.scores).map((s) => s.score);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function truncateTraceDetail(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function degradedWorkerDetail(report: EvaluatorWorkerReport): string {
  const fromFinding = report.findings[0]?.detail?.trim();
  if (fromFinding) return truncateTraceDetail(fromFinding, WORKER_TRACE_DETAIL_MAX);
  const fromFail = report.hardFails[0]?.message?.trim();
  if (fromFail) return truncateTraceDetail(fromFail, WORKER_TRACE_DETAIL_MAX);
  return 'Evaluator worker failed';
}

export function traceRowAgenticPhase(phase: AgenticPhase): RunTraceEvent {
  const label =
    phase === AGENTIC_PHASE.BUILDING
      ? 'Build phase'
      : phase === AGENTIC_PHASE.EVALUATING
        ? 'Evaluation phase'
        : phase === AGENTIC_PHASE.REVISING
          ? 'Revision phase'
          : 'Run complete';
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'phase',
    label,
    phase,
    status: 'info',
  };
}

export function traceRowEvaluationProgress(
  round: number,
  phase: string,
  message?: string,
): RunTraceEvent {
  const nextStatus = [message ?? phase, `round ${round}`].filter(Boolean).join(' · ');
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'evaluation_progress',
    label: nextStatus,
    phase: AGENTIC_PHASE.EVALUATING,
    round,
    status: 'info',
  };
}

export function traceRowEvaluationWorker(
  round: number,
  rubric: EvaluatorRubricId,
  report: EvaluatorWorkerReport,
): RunTraceEvent {
  const name = RUBRIC_TRACE_LABEL[rubric];
  if (isEvaluatorWorkerDegraded(report)) {
    return {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind: 'evaluation_worker',
      label: `${name} rubric failed`,
      phase: AGENTIC_PHASE.EVALUATING,
      round,
      status: 'error',
      detail: degradedWorkerDetail(report),
    };
  }
  const avg = averageRubricScore(report);
  const scorePart =
    avg != null && Number.isFinite(avg) ? ` · avg ${avg.toFixed(1)}` : '';
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'evaluation_worker',
    label: `${name} rubric complete${scorePart}`,
    phase: AGENTIC_PHASE.EVALUATING,
    round,
    status: 'success',
  };
}

export function traceRowEvaluationReport(
  round: number,
  scoreLabel: string,
  hardFailsLen: number,
  hasDegradedWorker: boolean,
): RunTraceEvent {
  const status = hasDegradedWorker ? 'error' : hardFailsLen > 0 ? 'warning' : 'success';
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'evaluation_report',
    label: `Evaluation round ${round} scored ${scoreLabel}`,
    phase: 'evaluating',
    round,
    status,
  };
}

export function traceRowRevisionRound(round: number): RunTraceEvent {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'revision_round',
    label: `Revision round ${round}`,
    phase: 'revising',
    round,
    status: 'warning',
  };
}

export function traceRowCheckpoint(checkpoint: AgenticCheckpoint): RunTraceEvent {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'checkpoint',
    label: `Checkpoint: ${checkpoint.stopReason ?? 'complete'}`,
    phase: 'complete',
    status:
      checkpoint.stopReason === 'satisfied' || checkpoint.stopReason === 'build_only' ? 'success' : 'info',
  };
}
