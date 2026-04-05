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
  supportsVision: z.boolean().optional(),
  agenticMaxRevisionRounds: z.number().finite().optional(),
});

export type MetaHarnessConfig = z.infer<typeof MetaHarnessConfigSchema>;

/** Per-test summary.json written under test-results/<name>/ */
export const TestCaseSummarySchema = z.object({
  overallScore: z.number().finite().nullable().optional(),
  stopReason: z.string().nullable().optional(),
});

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
