import { z } from 'zod';
import { ReferenceImageSchema } from '../types/spec';
import { ThinkingLevelSchema } from '../lib/thinking-defaults';

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
        thinkingLevel: ThinkingLevelSchema,
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

export const OpenRouterBudgetStatusSchema = z.enum([
  'available',
  'out_of_credits',
  'rate_limited',
  'not_configured',
  'unknown',
]);

export const OpenRouterLimitResetSchema = z.enum(['daily', 'weekly', 'monthly']).nullable();

/** GET /api/provider-status/openrouter */
export const OpenRouterBudgetStatusResponseSchema = z.object({
  status: OpenRouterBudgetStatusSchema,
  limit: z.number().nullable().optional(),
  limitRemaining: z.number().nullable().optional(),
  limitReset: OpenRouterLimitResetSchema.optional(),
  usageDaily: z.number().optional(),
  resetAt: z.string().optional(),
  checkedAt: z.string(),
  message: z.string(),
});

/** POST /api/design-system/extract */
export const DesignSystemExtractResponseSchema = z.object({
  result: z.string(),
  lint: z
    .object({
      errors: z.number().int().min(0),
      warnings: z.number().int().min(0),
      infos: z.number().int().min(0),
      findings: z
        .array(
          z.object({
            severity: z.enum(['error', 'warning', 'info']),
            message: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

/** POST /api/inputs/generate */
export const InputsGenerateResponseSchema = z.object({
  result: z.string(),
});

/** POST /api/internal-context/generate */
export const InternalContextGenerateResponseSchema = z.object({
  result: z.string(),
});

/** GET /api/config - default rubric blend (repo: src/lib/rubric-weights.json) */
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
  /** Server env `MAX_CONCURRENT_AGENTIC_RUNS` (1-100); parallel design/hypothesis lanes each use one slot. */
  maxConcurrentRuns: z.number().int().min(1).max(100),
  /** When false, the evaluator-driven revision loop UI is hidden on hypothesis nodes. */
  autoImprove: z.boolean(),
});

export type IncubateWireResponse = z.infer<typeof IncubateResponseSchema>;
export type HypothesisPromptBundleWireResponse = z.infer<
  typeof HypothesisPromptBundleResponseSchema
>;
export type ModelsWireResponse = z.infer<typeof ModelsResponseSchema>;
export type ProvidersListWireResponse = z.infer<typeof ProvidersListResponseSchema>;
export type OpenRouterBudgetStatusResponse = z.infer<
  typeof OpenRouterBudgetStatusResponseSchema
>;
export type DesignSystemExtractWireResponse = z.infer<typeof DesignSystemExtractResponseSchema>;
export type InputsGenerateWireResponse = z.infer<typeof InputsGenerateResponseSchema>;
export type InternalContextGenerateWireResponse = z.infer<
  typeof InternalContextGenerateResponseSchema
>;
export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;
