/**
 * Parse and compare rubric weight objects (repo JSON, candidate artifacts).
 */
import { EVALUATOR_RUBRIC_IDS, type EvaluatorRubricId } from '../src/types/evaluation.ts';
import { RubricWeightsJsonSchema } from './schemas.ts';

export const RUBRIC_WEIGHT_EPSILON = 1e-6;

export type RubricWeightsRecord = Record<EvaluatorRubricId, number>;

export function parseRubricWeightsJson(raw: string): RubricWeightsRecord | null {
  try {
    const data: unknown = JSON.parse(raw);
    const parsed = RubricWeightsJsonSchema.safeParse(data);
    if (!parsed.success) return null;
    const o = parsed.data;
    const out = {} as RubricWeightsRecord;
    for (const id of EVALUATOR_RUBRIC_IDS) {
      const v = o[id];
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      out[id] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function rubricWeightsDiffer(live: RubricWeightsRecord, winner: RubricWeightsRecord): boolean {
  for (const id of EVALUATOR_RUBRIC_IDS) {
    if (Math.abs(live[id] - winner[id]) > RUBRIC_WEIGHT_EPSILON) return true;
  }
  return false;
}
