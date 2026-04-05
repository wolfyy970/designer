/**
 * Zod validation for meta-harness disk JSON (config + small artifacts).
 */
import { z } from 'zod';

export const MetaHarnessConfigSchema = z.object({
  mode: z.enum(['compile', 'e2e', 'design']).optional(),
  apiBaseUrl: z.string().min(1),
  evalRunsBaseDir: z.string().optional(),
  iterations: z.number().finite(),
  proposerModel: z.string(),
  proposerMaxToolRounds: z.number().finite(),
  defaultCompilerProvider: z.string(),
  compileProvider: z.string().optional(),
  compileModel: z.string().optional(),
  hypothesisEvalModel: z.string().optional(),
  compileHypothesisCount: z.number().finite().optional(),
  hypothesisRubricTimeoutMs: z.number().finite().optional(),
  /** POST /api/hypothesis/generate (full SSE read) — default see constants.DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS */
  hypothesisGenerateTimeoutMs: z.number().finite().optional(),
  /** Each OpenRouter chat completion (proposer tool rounds; rubric unless overridden by signal) */
  openRouterChatTimeoutMs: z.number().finite().optional(),
  supportsVision: z.boolean().optional(),
  agenticMaxRevisionRounds: z.number().finite().optional(),
});

export type MetaHarnessConfig = z.infer<typeof MetaHarnessConfigSchema>;

/** On-disk `prompt-overrides.json`: map of prompt key -> body (string values only; other types ignored). */
export const PromptOverridesSchema = z.record(z.string(), z.string());

type PromptOverrides = z.infer<typeof PromptOverridesSchema>;

/**
 * Parse JSON then coerce to string values only (same as legacy meta-harness readers).
 * Validates with `PromptOverridesSchema` so keys/values are plain strings.
 */
/** Parse already-parsed JSON (e.g. tests). */
export function parsePromptOverridesFromUnknown(data: unknown): PromptOverrides {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  const checked = PromptOverridesSchema.safeParse(out);
  return checked.success ? checked.data : {};
}

export function parsePromptOverridesJsonString(raw: string): PromptOverrides {
  try {
    return parsePromptOverridesFromUnknown(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Per-test summary.json written under test-results/<name>/ */
export const TestCaseSummarySchema = z.object({
  overallScore: z.number().finite().nullable().optional(),
  stopReason: z.string().nullable().optional(),
});

/** summary.json may include rubricMeans for proposer context display */
export const TestCaseSummaryFileSchema = TestCaseSummarySchema.extend({
  rubricMeans: z.record(z.string(), z.number().finite()).optional(),
});

/** On-disk rubric-weights.json — non-negative finite weights by string id */
export const RubricWeightsJsonSchema = z.record(z.string(), z.number().finite());

/** eval-runs/.../meta.json (partial — only fields we read) */
export const EvalRunMetaSchema = z.object({
  finalOverallScore: z.number().finite().optional(),
  stopReason: z.string().optional(),
});

export const AggregateJsonSchema = z.object({
  meanScore: z.number().finite().optional(),
  candidateId: z.number().finite().optional(),
  scores: z.array(z.number()).optional(),
  iteration: z.number().finite().optional(),
});

export const BestCandidateJsonSchema = z.object({
  meanScore: z.number().finite().optional(),
  candidateId: z.number().finite().optional(),
  updatedAt: z.string().optional(),
});

/** Partial runtime check for SSE `evaluation_report` / checkpoint aggregate (fields harness reads; extra keys preserved). */
export const AggregatedEvaluationReportHarnessSchema = z
  .object({
    overallScore: z.number().finite(),
    normalizedScores: z.record(z.string(), z.number().finite()).optional(),
    revisionBrief: z.string().optional(),
  })
  .passthrough();
