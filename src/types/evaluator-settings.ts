import { DEFAULT_RUBRIC_WEIGHTS, type EvaluatorRubricId } from './evaluation.ts';

export { DEFAULT_RUBRIC_WEIGHTS };

/**
 * Evaluator loop defaults / per-hypothesis overrides (future).
 * Matches server: `agenticMaxRevisionRounds` (0–20), `agenticMinOverallScore` (0–5, optional), optional `rubricWeights`.
 */
export interface EvaluatorSettings {
  maxRevisionRounds: number;
  /** 0–5 or null when early exit-by-score is disabled */
  minOverallScore: number | null;
  /** Per-rubric blend for overall score (renormalized to sum 1 in the store / server). */
  rubricWeights: Record<EvaluatorRubricId, number>;
}

export const EVALUATOR_MAX_REVISION_ROUNDS_MIN = 0;
export const EVALUATOR_MAX_REVISION_ROUNDS_MAX = 20;
export const EVALUATOR_MIN_SCORE = 0;
export const EVALUATOR_MAX_SCORE = 5;

export const DEFAULT_EVALUATOR_SETTINGS: EvaluatorSettings = {
  maxRevisionRounds: 5,
  minOverallScore: null,
  rubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
};
