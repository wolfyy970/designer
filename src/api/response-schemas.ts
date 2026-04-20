import { z } from 'zod';
import { ReferenceImageSchema } from '../types/spec';

/** Match server incubate parse: models may send `range` as a string or string[]. */
const dimensionRangeSchema = z.union([
  z.string(),
  z.array(z.string()).transform((a) => a.join(', ')),
]);

const DimensionSchema = z.object({
  name: z.string(),
  range: dimensionRangeSchema,
  isConstant: z.boolean(),
});

const HypothesisStrategyWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string()),
});

/** POST /api/incubate response (`IncubationPlan`). */
export const IncubateResponseSchema = z.object({
  id: z.string(),
  specId: z.string(),
  dimensions: z.array(DimensionSchema),
  hypotheses: z.array(HypothesisStrategyWireSchema),
  generatedAt: z.string(),
  approvedAt: z.string().optional(),
  incubatorModel: z.string(),
});

const CompiledPromptSchema = z.object({
  id: z.string(),
  strategyId: z.string(),
  specId: z.string(),
  prompt: z.string(),
  images: z.array(ReferenceImageSchema),
  compiledAt: z.string(),
});

const EvaluationContextPayloadSchema = z
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
  .passthrough();

const ProvenanceContextSchema = z.object({
  strategies: z.record(
    z.string(),
    z.object({
      name: z.string(),
      hypothesis: z.string(),
      rationale: z.string(),
      dimensionValues: z.record(z.string(), z.string()),
    }),
  ),
  designSystemSnapshot: z.string().optional(),
});

/** POST /api/hypothesis/prompt-bundle response. */
export const HypothesisPromptBundleResponseSchema = z.object({
  prompts: z.array(CompiledPromptSchema),
  evaluationContext: EvaluationContextPayloadSchema.nullable(),
  provenance: ProvenanceContextSchema,
  generationContext: z.object({
    modelCredentials: z.array(
      z.object({
        providerId: z.string(),
        modelId: z.string(),
        thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']),
      }),
    ),
  }),
});

const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().optional(),
  supportsVision: z.boolean().optional(),
  supportsReasoning: z.boolean().optional(),
});

export const ModelsResponseSchema = z.array(ProviderModelSchema);

const ProviderInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const ProvidersListResponseSchema = z.array(ProviderInfoSchema);

/** POST /api/design-system/extract */
export const DesignSystemExtractResponseSchema = z.object({
  result: z.string(),
});

/** POST /api/inputs/generate */
export const InputsGenerateResponseSchema = z.object({
  result: z.string(),
});


/** GET /api/config — default rubric blend (repo: src/lib/rubric-weights.json) */
export const DefaultRubricWeightsSchema = z.object({
  design: z.number(),
  strategy: z.number(),
  implementation: z.number(),
  browser: z.number(),
});

/** GET /api/config */
export const AppConfigResponseSchema = z.object({
  lockdown: z.boolean(),
  lockdownProviderId: z.string().optional(),
  lockdownModelId: z.string().optional(),
  lockdownModelLabel: z.string().optional(),
  /** Server operator default; client Settings may override per session. */
  agenticMaxRevisionRounds: z.number().int().min(0).max(20),
  agenticMinOverallScore: z.number().min(0).max(5).nullable(),
  /** Matches repo defaults until promotion or manual edit + server restart. */
  defaultRubricWeights: DefaultRubricWeightsSchema,
  /** Server env `MAX_CONCURRENT_AGENTIC_RUNS` (1–100); parallel design/hypothesis lanes each use one slot. */
  maxConcurrentRuns: z.number().int().min(1).max(100),
});

export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;
