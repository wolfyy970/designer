/**
 * Rule-based thresholds for {@link enforceRevisionGate} (agentic revision loop).
 * Centralized so product tuning and tests reference one place.
 */

import {
  DEFAULT_RUBRIC_WEIGHTS,
  EVALUATOR_RUBRIC_IDS,
  type EvaluatorRubricId,
} from '../../src/types/evaluation.ts';

const DESIGN_STRATEGY_RUBRICS: ReadonlySet<EvaluatorRubricId> = new Set(['design', 'strategy']);
const IMPL_BROWSER_RUBRICS: ReadonlySet<EvaluatorRubricId> = new Set(['implementation', 'browser']);

/** Per-rubric weights for {@link computeWeightedOverallFromRubricMeans}. Must sum to 1. */
export const RUBRIC_WEIGHTS: Record<EvaluatorRubricId, number> = { ...DEFAULT_RUBRIC_WEIGHTS };

/** Re-export for consumers that import from the gate module. */
export { DEFAULT_RUBRIC_WEIGHTS };

/**
 * Merge optional per-rubric overrides with {@link RUBRIC_WEIGHTS} and renormalize so weights sum to 1.
 * Ignores non-finite or negative entries.
 */
export function resolveRubricWeights(
  override?: Partial<Record<EvaluatorRubricId, number>>,
): Record<EvaluatorRubricId, number> {
  if (!override || Object.keys(override).length === 0) {
    return { ...RUBRIC_WEIGHTS };
  }
  const out: Record<EvaluatorRubricId, number> = { ...RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const v = override[rid];
    if (v != null && Number.isFinite(v) && v >= 0) {
      out[rid] = v;
    }
  }
  const sum = EVALUATOR_RUBRIC_IDS.reduce((acc, rid) => acc + out[rid], 0);
  if (sum <= 0) return { ...RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    out[rid] = out[rid] / sum;
  }
  return out;
}

/** Normalized per-criterion scores at or below this value trigger revision for design & strategy rubrics. */
export const REVISION_GATE_CRITICAL_SCORE_MAX = 2;

/**
 * Normalized per-criterion scores at or below this value trigger revision for implementation & browser rubrics only.
 * Looser than design/strategy so minor code hygiene (e.g. score 2) does not force a revision round.
 */
export const REVISION_GATE_IMPL_CRITICAL_SCORE_MAX = 1;

/** Weighted overall score below this triggers revision when there are no other gate triggers. */
export const REVISION_GATE_LOW_AVERAGE_THRESHOLD = 3.5;

/**
 * Parse rubric id from a normalized score key (`design_design_quality`, `browser_page_structure`).
 */
export function rubricFromNormalizedScoreKey(key: string): EvaluatorRubricId | null {
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const prefix = `${rid}_`;
    if (key.startsWith(prefix)) return rid;
  }
  return null;
}

/**
 * True if any normalized criterion trips the tiered critical band (design/strategy vs impl/browser).
 */
export function tieredAnyCriticalNormalizedScores(normalizedScores: Record<string, number>): boolean {
  for (const [key, score] of Object.entries(normalizedScores)) {
    const r = rubricFromNormalizedScoreKey(key);
    if (!r) continue;
    if (DESIGN_STRATEGY_RUBRICS.has(r) && score <= REVISION_GATE_CRITICAL_SCORE_MAX) return true;
    if (IMPL_BROWSER_RUBRICS.has(r) && score <= REVISION_GATE_IMPL_CRITICAL_SCORE_MAX) return true;
  }
  return false;
}

/**
 * Mean score for one rubric from worker report scores (ignores nested structure).
 */
export function meanRubricScores(scores: Record<string, { score: number; notes: string }>): number {
  const vals = Object.values(scores).map((s) => s.score);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

/**
 * Weighted overall from per-rubric means. Uses `weights` when provided; otherwise {@link RUBRIC_WEIGHTS}.
 */
export function computeWeightedOverallFromRubricMeans(
  means: Partial<Record<EvaluatorRubricId, number>>,
  weights: Record<EvaluatorRubricId, number> = RUBRIC_WEIGHTS,
): number {
  let sum = 0;
  let w = 0;
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const m = means[rid];
    if (m === undefined || !Number.isFinite(m)) continue;
    const wt = weights[rid];
    if (!Number.isFinite(wt) || wt <= 0) continue;
    sum += wt * m;
    w += wt;
  }
  if (w <= 0) return 0;
  return sum / w;
}

/** Per-rubric mean scores from flattened normalizedScores (`design_*`, …). */
export function rubricMeansFromNormalizedScores(
  normalizedScores: Record<string, number>,
): Partial<Record<EvaluatorRubricId, number>> {
  const out: Partial<Record<EvaluatorRubricId, number>> = {};
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const prefix = `${rid}_`;
    const vals = Object.entries(normalizedScores)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
    if (vals.length > 0) {
      out[rid] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return out;
}
