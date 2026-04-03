import { AGENTIC_PHASE } from '../constants/agentic-stream';
import type { AgenticCheckpoint, AgenticPhase } from '../types/evaluation';
import type { RunTraceEvent } from '../types/provider';

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

export function traceRowEvaluationReport(
  round: number,
  scoreLabel: string,
  hardFailsLen: number,
): RunTraceEvent {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'evaluation_report',
    label: `Evaluation round ${round} scored ${scoreLabel}`,
    phase: 'evaluating',
    round,
    status: hardFailsLen > 0 ? 'warning' : 'success',
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
    status: checkpoint.stopReason === 'satisfied' ? 'success' : 'info',
  };
}
