/**
 * Parallel (or sequential) evaluator workers + deterministic aggregate merge.
 * Uses GenerationProvider generateChat — not PI — so harness stays lightweight.
 *
 * Implementation is split into:
 * - {@link ./evaluator-prompt-assembly.ts} — user message for LLM rubrics
 * - {@link ./evaluator-worker-dispatch.ts} — workers, Zod boundary, browser harness
 * - {@link ./evaluator-aggregation.ts} — merge + revision gate helpers
 */
export { buildEvaluatorUserContent } from './evaluator-prompt-assembly.ts';
export {
  evaluatorWorkerReportSchema,
  normalizeEvaluatorWorkerPayload,
  parseModelJsonObject,
  buildDegradedReport,
  runEvaluationWorkers,
  type EvaluationRoundInput,
} from './evaluator-worker-dispatch.ts';
export { aggregateEvaluationReports, isEvalSatisfied, enforceRevisionGate } from './evaluator-aggregation.ts';
