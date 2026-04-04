import { z } from 'zod';
import { ThinkingLevelSchema } from './hypothesis-schemas.ts';

const EvaluationContextSchema = z
  .object({
    strategyName: z.string().optional(),
    hypothesis: z.string().optional(),
    rationale: z.string().optional(),
    measurements: z.string().optional(),
    dimensionValues: z.record(z.string(), z.string()).optional(),
    objectivesMetrics: z.string().optional(),
    designConstraints: z.string().optional(),
    designSystemSnapshot: z.string().optional(),
    outputFormat: z.string().optional(),
  })
  .optional();

export const GenerateStreamBodySchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  /** Client-issued id to correlate LLM log rows with a UI run (optional). */
  correlationId: z.string().min(1).max(200).optional(),
  supportsVision: z.boolean().optional(),
  mode: z.enum(['single', 'agentic']).optional().default('single'),
  thinkingLevel: ThinkingLevelSchema.optional(),
  evaluationContext: EvaluationContextSchema,
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
});

export type GenerateStreamBody = z.infer<typeof GenerateStreamBodySchema>;
