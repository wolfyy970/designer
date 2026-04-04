import { z } from 'zod';
import type { EvaluatorRubricId } from '../types/evaluation';
import { EVALUATOR_RUBRIC_IDS } from '../types/evaluation';

/** Zod enum aligned with {@link EVALUATOR_RUBRIC_IDS} for wire/payload validation. */
export const evaluatorRubricIdZodSchema = z.enum(
  EVALUATOR_RUBRIC_IDS as unknown as [EvaluatorRubricId, EvaluatorRubricId, ...EvaluatorRubricId[]],
);
