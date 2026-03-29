/**
 * Structured design evaluation (generator/evaluator harness).
 * Shared between client metadata and server orchestration.
 */

export type EvaluatorRubricId = 'design' | 'strategy' | 'implementation' | 'browser';

export type AgenticStopReason = 'satisfied' | 'max_revisions' | 'aborted' | 'revision_failed';

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

/** Optional binary payloads from deterministic eval workers (e.g. Playwright). */
export interface BrowserEvalArtifacts {
  browserScreenshot?: {
    mediaType: 'image/jpeg' | 'image/png';
    base64: string;
  };
}

/** Single rubric evaluator JSON output */
export interface EvaluatorWorkerReport {
  rubric: EvaluatorRubricId;
  scores: Record<string, EvalCriterionScore>;
  findings: EvalFinding[];
  hardFails: EvalHardFail[];
  /**
   * When set, merge with VM preflight only: do not merge scores/hardFails from Playwright.
   * Used when Chromium is missing or Playwright failed so setup issues do not block the revision loop.
   */
  playwrightSkipped?: { reason: 'browser_unavailable' | 'eval_error'; message: string };
  /** Populated by browser-grounded eval (e.g. JPEG viewport capture for debugging / future vision scoring). */
  artifacts?: BrowserEvalArtifacts;
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
  /** Why the agentic loop stopped (multi-round revision). */
  stopReason?: AgenticStopReason;
  /** Number of PI revision sessions that ran after the first evaluation. */
  revisionAttempts?: number;
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
  /** Hint for skill selection and eval (e.g. html, react). */
  outputFormat?: string;
}

export type AgenticPhase = 'building' | 'evaluating' | 'revising' | 'complete';
