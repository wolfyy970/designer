import { z } from 'zod';
import { GENERATION_MODE } from '../../src/constants/generation.ts';
import { ThinkingLevelSchema } from './hypothesis-schemas.ts';

const EvaluationContextObjectSchema = z.object({
  strategyName: z.string().optional(),
  hypothesis: z.string().optional(),
  rationale: z.string().optional(),
  measurements: z.string().optional(),
  dimensionValues: z.record(z.string(), z.string()).optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  designSystemSnapshot: z.string().optional(),
  outputFormat: z.string().optional(),
});

/**
 * `undefined` — omit field: legacy /api/generate behavior still runs eval workers.
 * `null` — hypothesis single-pass: skip evaluation and revision entirely.
 */
const EvaluationContextSchema = EvaluationContextObjectSchema.nullish();

const RubricWeightsPartialSchema = z
  .object({
    design: z.number().finite().nonnegative().optional(),
    strategy: z.number().finite().nonnegative().optional(),
    implementation: z.number().finite().nonnegative().optional(),
    browser: z.number().finite().nonnegative().optional(),
  })
  .strict();

/** Legacy clients may send `single`; it is treated as agentic. */
const GenerateModeSchema = z
  .union([z.literal('single'), z.literal('agentic')])
  .optional()
  .default('agentic')
  .transform(() => GENERATION_MODE.AGENTIC);

export const GenerateStreamBodySchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  /** Client-issued id to correlate LLM log rows with a UI run (optional). */
  correlationId: z.string().min(1).max(200).optional(),
  supportsVision: z.boolean().optional(),
  mode: GenerateModeSchema,
  thinkingLevel: ThinkingLevelSchema.optional(),
  evaluationContext: EvaluationContextSchema,
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  /** Per-rubric weights merged with defaults and renormalized on the server. */
  rubricWeights: RubricWeightsPartialSchema.optional(),
});

export type GenerateStreamBody = z.infer<typeof GenerateStreamBodySchema>;
