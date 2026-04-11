/**
 * Zod schemas for hypothesis workspace API payloads — single source for route + tests.
 */
import { z } from 'zod';
import { DesignSpecSchema } from '../../src/types/spec.ts';
import { DomainDesignSystemContentSchema } from '../../src/lib/domain-design-system-schema.ts';
import { WorkspaceSnapshotSchema } from '../../src/lib/workspace-snapshot-schema.ts';

export const ThinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high']);

export const DomainHypothesisSchema = z.object({
  id: z.string(),
  incubatorId: z.string(),
  strategyId: z.string(),
  modelNodeIds: z.array(z.string()),
  designSystemNodeIds: z.array(z.string()),
  revisionEnabled: z.boolean().optional(),
  maxRevisionRounds: z.number().int().min(0).max(20).optional(),
  minOverallScore: z.union([z.number().min(0).max(5), z.null()]).optional(),
  placeholder: z.boolean(),
});

export const DomainModelProfileSchema = z.object({
  nodeId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  title: z.string().optional(),
  thinkingLevel: ThinkingLevelSchema.optional(),
});

export const HypothesisStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string()),
});

/** Base object schema — extendable. Accepts `strategy` (preferred) or legacy `hypothesisStrategy`/`variantStrategy`. */
const HypothesisWorkspaceCoreObjectSchema = z.object({
  hypothesisNodeId: z.string().min(1),
  strategy: HypothesisStrategySchema.optional(),
  hypothesisStrategy: HypothesisStrategySchema.optional(),
  variantStrategy: HypothesisStrategySchema.optional(),
  spec: DesignSpecSchema,
  snapshot: WorkspaceSnapshotSchema,
  domainHypothesis: DomainHypothesisSchema.nullish(),
  modelProfiles: z.record(z.string(), DomainModelProfileSchema),
  designSystems: z.record(z.string(), DomainDesignSystemContentSchema),
  defaultIncubatorProvider: z.string().min(1),
});

type WorkspaceCoreRaw = z.infer<typeof HypothesisWorkspaceCoreObjectSchema>;
function coerceStrategy<T extends WorkspaceCoreRaw>(obj: T) {
  const strategy = obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy;
  if (!strategy) throw new Error('strategy is required');
  const { hypothesisStrategy, variantStrategy, ...rest } = obj;
  void hypothesisStrategy;
  void variantStrategy;
  return { ...rest, strategy };
}

export const HypothesisWorkspaceCoreSchema =
  HypothesisWorkspaceCoreObjectSchema.transform(coerceStrategy);

export const PromptBundleRequestSchema = HypothesisWorkspaceCoreSchema;

export const HypothesisGenerateRequestSchema = HypothesisWorkspaceCoreObjectSchema.extend({
  supportsVision: z.boolean().optional(),
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  rubricWeights: z
    .object({
      design: z.number().finite().nonnegative().optional(),
      strategy: z.number().finite().nonnegative().optional(),
      implementation: z.number().finite().nonnegative().optional(),
      browser: z.number().finite().nonnegative().optional(),
    })
    .strict()
    .optional(),
  correlationId: z.string().min(1).max(200).optional(),
}).transform(coerceStrategy);

export type HypothesisWorkspaceCoreInput = z.infer<typeof HypothesisWorkspaceCoreSchema>;
