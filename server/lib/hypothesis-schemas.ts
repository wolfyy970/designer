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
  variantStrategyId: z.string(),
  modelNodeIds: z.array(z.string()),
  designSystemNodeIds: z.array(z.string()),
  agentMode: z.enum(['single', 'agentic']).optional(),
  placeholder: z.boolean(),
});

export const DomainModelProfileSchema = z.object({
  nodeId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  title: z.string().optional(),
  thinkingLevel: ThinkingLevelSchema.optional(),
});

export const VariantStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string()),
});

export const HypothesisWorkspaceCoreSchema = z.object({
  hypothesisNodeId: z.string().min(1),
  variantStrategy: VariantStrategySchema,
  spec: DesignSpecSchema,
  snapshot: WorkspaceSnapshotSchema,
  domainHypothesis: DomainHypothesisSchema.nullish(),
  modelProfiles: z.record(z.string(), DomainModelProfileSchema),
  designSystems: z.record(z.string(), DomainDesignSystemContentSchema),
  defaultCompilerProvider: z.string().min(1),
});

export const PromptBundleRequestSchema = HypothesisWorkspaceCoreSchema;

export const HypothesisGenerateRequestSchema = HypothesisWorkspaceCoreSchema.extend({
  supportsVision: z.boolean().optional(),
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});

export type HypothesisWorkspaceCoreInput = z.infer<typeof HypothesisWorkspaceCoreSchema>;
