import { EVALUATOR_MAX_SCORE } from '../../../types/evaluator-settings';

/** Default pass/fail split used by the scorecard. Kept here so tests and
 * callers import the same literal. */
export const SCORECARD_PASS_THRESHOLD = 3.8;

/** Semantic tone for a scorecard numeric or bar fill. Sage ≥ threshold,
 * amber below. Callers map to `text-success` / `bg-success` etc. */
export function thresholdTone(
  score: number,
  threshold: number = SCORECARD_PASS_THRESHOLD,
): 'success' | 'warning' {
  return score >= threshold ? 'success' : 'warning';
}

/** Clamp a score to a 0–100 bar-fill percentage against `EVALUATOR_MAX_SCORE`. */
export function scoreToBarPercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, (score / EVALUATOR_MAX_SCORE) * 100));
}
