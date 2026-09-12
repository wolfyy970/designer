import { z } from 'zod';
import type { EvaluatorRubricId, EvaluatorWorkerReport } from '../types/evaluation';
import { EVALUATOR_RUBRIC_IDS } from '../types/evaluation';

/** Zod enum aligned with {@link EVALUATOR_RUBRIC_IDS} for wire/payload validation. */
export const evaluatorRubricIdZodSchema = z.enum(
  EVALUATOR_RUBRIC_IDS as unknown as [EvaluatorRubricId, EvaluatorRubricId, ...EvaluatorRubricId[]],
);

/**
 * **The** wire/payload shape of `EvaluatorWorkerReport`.
 *
 * This was previously declared three times with different field sets: here, in
 * `generate-sse-event-schema.ts` (as `evaluatorWorkerReportSSESchema`), and in
 * `server/services/evaluator-worker-dispatch.ts` (as
 * `evaluatorWorkerReportSchema`). The three were not equivalent — the dispatch
 * copy, which is the one that *parses the LLM's own response*, was missing
 * `rawTrace` and carried no `.passthrough()`, so a worker payload containing
 * `rawTrace` would have had that field silently stripped before it reached
 * `EvaluatorWorkerReport.rawTrace`.
 *
 * `.passthrough()` is deliberate: both consumers forward unknown keys rather
 * than dropping them, which is what makes adding a worker field a
 * non-breaking change.
 */
export const evaluatorWorkerReportSchema = z
  .object({
    rubric: evaluatorRubricIdZodSchema,
    scores: z.record(z.string(), z.object({ score: z.number(), notes: z.string() })),
    findings: z.array(
      z.object({
        severity: z.enum(['high', 'medium', 'low']),
        summary: z.string(),
        detail: z.string(),
      }),
    ),
    hardFails: z.array(z.object({ code: z.string(), message: z.string() })),
    rawTrace: z.string().optional(),
    playwrightSkipped: z
      .object({
        reason: z.enum(['browser_unavailable', 'eval_error']),
        message: z.string(),
      })
      .optional(),
    artifacts: z
      .object({
        browserScreenshot: z
          .object({ mediaType: z.enum(['image/jpeg', 'image/png']), base64: z.string() })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Compile-time guard that the schema still describes `EvaluatorWorkerReport`.
 *
 * Tests are type-checked as of `tsconfig.tests.json`, so if someone adds a
 * required field to the interface and not to the schema (or changes a type so
 * the inferred shape no longer lines up), `tsc -b` fails here rather than the
 * drift going unnoticed for another year.
 */
export type EvaluatorWorkerReportFromSchema = z.infer<typeof evaluatorWorkerReportSchema>;
const _schemaMatchesType: EvaluatorWorkerReport = {} as EvaluatorWorkerReportFromSchema;
void _schemaMatchesType;
