import { z } from "zod";
import { R as ReferenceImageSchema, T as ThinkingLevelSchema } from "./thinking-defaults-BkNuccwq.js";
const dimensionRangeSchema = z.union([
  z.string(),
  z.array(z.string()).transform((a) => a.join(", "))
]);
const DimensionSchema = z.object({
  name: z.string(),
  range: dimensionRangeSchema,
  isConstant: z.boolean()
});
const HypothesisStrategyWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string())
});
z.object({
  id: z.string(),
  specId: z.string(),
  dimensions: z.array(DimensionSchema),
  hypotheses: z.array(HypothesisStrategyWireSchema),
  generatedAt: z.string(),
  approvedAt: z.string().optional(),
  incubatorModel: z.string()
});
const CompiledPromptSchema = z.object({
  id: z.string(),
  strategyId: z.string(),
  specId: z.string(),
  prompt: z.string(),
  images: z.array(ReferenceImageSchema),
  compiledAt: z.string()
});
const EvaluationContextPayloadSchema = z.object({
  strategyName: z.string().optional(),
  hypothesis: z.string().optional(),
  rationale: z.string().optional(),
  measurements: z.string().optional(),
  dimensionValues: z.record(z.string(), z.string()).optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  designSystemSnapshot: z.string().optional(),
  outputFormat: z.string().optional()
}).passthrough();
const ProvenanceContextSchema = z.object({
  strategies: z.record(
    z.string(),
    z.object({
      name: z.string(),
      hypothesis: z.string(),
      rationale: z.string(),
      dimensionValues: z.record(z.string(), z.string())
    })
  ),
  designSystemSnapshot: z.string().optional()
});
z.object({
  prompts: z.array(CompiledPromptSchema),
  evaluationContext: EvaluationContextPayloadSchema.nullable(),
  provenance: ProvenanceContextSchema,
  generationContext: z.object({
    modelCredentials: z.array(
      z.object({
        providerId: z.string(),
        modelId: z.string(),
        thinkingLevel: ThinkingLevelSchema
      })
    )
  })
});
const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().optional(),
  supportsVision: z.boolean().optional(),
  supportsReasoning: z.boolean().optional()
});
z.array(ProviderModelSchema);
const ProviderInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string()
});
z.array(ProviderInfoSchema);
const OpenRouterBudgetStatusSchema = z.enum([
  "available",
  "out_of_credits",
  "rate_limited",
  "not_configured",
  "unknown"
]);
const OpenRouterLimitResetSchema = z.enum(["daily", "weekly", "monthly"]).nullable();
const OpenRouterBudgetStatusResponseSchema = z.object({
  status: OpenRouterBudgetStatusSchema,
  limit: z.number().nullable().optional(),
  limitRemaining: z.number().nullable().optional(),
  limitReset: OpenRouterLimitResetSchema.optional(),
  usageDaily: z.number().optional(),
  resetAt: z.string().optional(),
  checkedAt: z.string(),
  message: z.string()
});
z.object({
  result: z.string(),
  lint: z.object({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
    infos: z.number().int().min(0),
    findings: z.array(
      z.object({
        severity: z.enum(["error", "warning", "info"]),
        message: z.string()
      })
    ).optional()
  }).optional()
});
z.object({
  result: z.string()
});
z.object({
  result: z.string()
});
const DefaultRubricWeightsSchema = z.object({
  design: z.number(),
  strategy: z.number(),
  implementation: z.number(),
  browser: z.number()
});
const AppConfigResponseSchema = z.object({
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
  autoImprove: z.boolean()
});
export {
  AppConfigResponseSchema as A,
  OpenRouterBudgetStatusResponseSchema as O
};
