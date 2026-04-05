/**
 * Structured design evaluation (generator/evaluator harness).
 * Shared between client metadata and server orchestration.
 */

/** Canonical rubric order for parallel workers, aggregation, and UI. */
export const EVALUATOR_RUBRIC_IDS = ['design', 'strategy', 'implementation', 'browser'] as const;

export type EvaluatorRubricId = (typeof EVALUATOR_RUBRIC_IDS)[number];

/** Default blend for overall score (must sum to 1). Shared by client Settings and server aggregation. */
export const DEFAULT_RUBRIC_WEIGHTS: Record<EvaluatorRubricId, number> = {
  design: 0.4,
  strategy: 0.3,
  implementation: 0.2,
  browser: 0.1,
};

export const EVALUATOR_WORKER_COUNT = EVALUATOR_RUBRIC_IDS.length;

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
  /**
   * Full LLM response text for LLM rubrics (reasoning + JSON). Omitted for deterministic browser worker.
   * Not persisted to client localStorage (stripped in generation-store partialize).
   */
  rawTrace?: string;
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

/** True when the worker failed (LLM/parse/infrastructure) rather than returning a normal rubric result. */
export function isEvaluatorWorkerDegraded(report: EvaluatorWorkerReport): boolean {
  return report.hardFails.some((h) => h.code === 'evaluator_worker_error');
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
  /**
   * Per-LLM-rubric raw evaluator responses (typically design / strategy / implementation only).
   * Not persisted to client localStorage.
   */
  evaluatorTraces?: Partial<Record<EvaluatorRubricId, string>>;
}

export interface EvaluationRoundSnapshot {
  round: number;
  /** Virtual file tree evaluated in this round (build or post-revision); persisted in IndexedDB per round. */
  files?: Record<string, string>;
  design?: EvaluatorWorkerReport;
  strategy?: EvaluatorWorkerReport;
  implementation?: EvaluatorWorkerReport;
  browser?: EvaluatorWorkerReport;
  aggregate: AggregatedEvaluationReport;
}

/** Any rubric in this round hit a degraded worker path (see `isEvaluatorWorkerDegraded`). */
export function evaluationRoundSnapshotHasDegradedWorker(
  snapshot: Pick<EvaluationRoundSnapshot, 'design' | 'strategy' | 'implementation' | 'browser'>,
): boolean {
  for (const id of EVALUATOR_RUBRIC_IDS) {
    const rep = snapshot[id];
    if (rep && isEvaluatorWorkerDegraded(rep)) return true;
  }
  return false;
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
