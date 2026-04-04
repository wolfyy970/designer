import { z } from 'zod';
import { ReferenceImageSchema } from '../types/spec';

const DimensionSchema = z.object({
  name: z.string(),
  range: z.string(),
  isConstant: z.boolean(),
});

const VariantStrategyWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string()),
});

/** POST /api/compile response (`DimensionMap`). */
export const CompileResponseSchema = z.object({
  id: z.string(),
  specId: z.string(),
  dimensions: z.array(DimensionSchema),
  variants: z.array(VariantStrategyWireSchema),
  generatedAt: z.string(),
  approvedAt: z.string().optional(),
  compilerModel: z.string(),
});

const CompiledPromptSchema = z.object({
  id: z.string(),
  variantStrategyId: z.string(),
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
    agentMode: z.enum(['single', 'agentic']),
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

const LlmLogEntrySchema = z
  .object({
    id: z.string(),
    timestamp: z.string(),
    status: z.enum(['in_progress', 'complete', 'error']).optional(),
    correlationId: z.string().optional(),
    source: z.enum([
      'compiler',
      'planner',
      'builder',
      'designSystem',
      'evaluator',
      'agentCompaction',
      'other',
    ]),
    phase: z.string().optional(),
    model: z.string(),
    provider: z.string(),
    providerName: z.string().optional(),
    systemPrompt: z.string(),
    userPrompt: z.string(),
    response: z.string(),
    durationMs: z.number(),
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    reasoningTokens: z.number().optional(),
    cachedPromptTokens: z.number().optional(),
    costCredits: z.number().optional(),
    truncated: z.boolean().optional(),
    toolCalls: z.array(z.object({ name: z.string(), path: z.string().optional() })).optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const ObservabilityLineTraceSchema = z.object({
  v: z.literal(1),
  ts: z.string(),
  type: z.literal('trace'),
  payload: z.object({
    event: z.record(z.string(), z.unknown()),
    correlationId: z.string().optional(),
    resultId: z.string().optional(),
  }),
});

export const ObservabilityLogsResponseSchema = z.object({
  llm: z.array(LlmLogEntrySchema),
  trace: z.array(ObservabilityLineTraceSchema),
});

/** GET /api/prompts/:key/history */
export const PromptHistoryListSchema = z.array(
  z.object({
    version: z.number(),
    createdAt: z.string(),
  }),
);

/** GET /api/prompts/:key/versions/:v */
export const PromptVersionBodySchema = z.object({
  key: z.string(),
  version: z.number(),
  body: z.string(),
  createdAt: z.string(),
});

/** POST /api/design-system/extract */
export const DesignSystemExtractResponseSchema = z.object({
  result: z.string(),
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
});

export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;
