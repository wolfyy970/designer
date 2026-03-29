/**
 * Structured design evaluation (generator/evaluator harness).
 * Shared between client metadata and server orchestration.
 */

export type EvaluatorRubricId = 'design' | 'strategy' | 'implementation' | 'browser';

export interface EvalCriterionScore {
  score: number;
  notes: string;
}

export interface EvalFinding {
  severity: 'high' | 'medium' | 'low';
  summary: string;
  detail: string;
}

export interface EvalHardFail {
  code: string;
  message: string;
}

/** Single rubric evaluator JSON output */
export interface EvaluatorWorkerReport {
  rubric: EvaluatorRubricId;
  scores: Record<string, EvalCriterionScore>;
  findings: EvalFinding[];
  hardFails: EvalHardFail[];
}

export interface AggregatedHardFail extends EvalHardFail {
  source: EvaluatorRubricId;
}

/** Deterministic merge of evaluator worker reports + revision-gate rules */
export interface AggregatedEvaluationReport {
  overallScore: number;
  normalizedScores: Record<string, number>;
  hardFails: AggregatedHardFail[];
  prioritizedFixes: string[];
  shouldRevise: boolean;
  revisionBrief: string;
}

export interface EvaluationRoundSnapshot {
  round: number;
  design?: EvaluatorWorkerReport;
  strategy?: EvaluatorWorkerReport;
  implementation?: EvaluatorWorkerReport;
  browser?: EvaluatorWorkerReport;
  aggregate: AggregatedEvaluationReport;
}

/** Lightweight checkpoint persisted alongside provenance for observability */
export interface AgenticCheckpoint {
  totalRounds: number;
  filesWritten: string[];
  finalTodosSummary: string;
  revisionBriefApplied?: string;
  completedAt: string;
}

/** Optional structured context (in addition to compiled prompt) for evaluator user messages */
export interface EvaluationContextPayload {
  strategyName?: string;
  hypothesis?: string;
  rationale?: string;
  measurements?: string;
  dimensionValues?: Record<string, string>;
  objectivesMetrics?: string;
  designConstraints?: string;
  designSystemSnapshot?: string;
}

export type AgenticPhase = 'building' | 'evaluating' | 'revising' | 'complete';
