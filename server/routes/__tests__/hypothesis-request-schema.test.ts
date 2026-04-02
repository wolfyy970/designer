import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DesignSpecSchema } from '../../../src/types/spec.ts';
import { DomainDesignSystemContentSchema } from '../../../src/lib/domain-design-system-schema.ts';
import { WorkspaceSnapshotSchema } from '../../../src/lib/workspace-snapshot-schema.ts';

const DomainHypothesisSchema = z.object({
  id: z.string(),
  incubatorId: z.string(),
  variantStrategyId: z.string(),
  modelNodeIds: z.array(z.string()),
  designSystemNodeIds: z.array(z.string()),
  agentMode: z.enum(['single', 'agentic']).optional(),
  placeholder: z.boolean(),
});

const DomainModelProfileSchema = z.object({
  nodeId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  title: z.string().optional(),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).optional(),
});

const VariantStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string()),
});

const HypothesisWorkspaceCoreSchema = z.object({
  hypothesisNodeId: z.string().min(1),
  variantStrategy: VariantStrategySchema,
  spec: DesignSpecSchema,
  snapshot: WorkspaceSnapshotSchema,
  domainHypothesis: DomainHypothesisSchema.nullish(),
  modelProfiles: z.record(z.string(), DomainModelProfileSchema),
  designSystems: z.record(z.string(), DomainDesignSystemContentSchema),
  defaultCompilerProvider: z.string().min(1),
});

function minimalValidSpec() {
  return {
    id: 'spec-1',
    title: 'T',
    sections: {},
    createdAt: '0',
    lastModified: '0',
    version: 1,
  };
}

function minimalCore(overrides: Record<string, unknown> = {}) {
  return {
    hypothesisNodeId: 'hyp-1',
    variantStrategy: {
      id: 'v1',
      name: 'V',
      hypothesis: 'h',
      rationale: 'r',
      measurements: 'm',
      dimensionValues: {},
    },
    spec: minimalValidSpec(),
    snapshot: { nodes: [], edges: [] },
    domainHypothesis: null,
    modelProfiles: {
      m1: { nodeId: 'm1', providerId: 'openrouter', modelId: 'x' },
    },
    designSystems: {},
    defaultCompilerProvider: 'openrouter',
    ...overrides,
  };
}

describe('HypothesisWorkspaceCoreSchema', () => {
  it('accepts minimal valid body', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(minimalCore());
    expect(r.success).toBe(true);
  });

  it('rejects invalid spec (missing title)', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(
      minimalCore({
        spec: { id: 'spec-1', sections: {}, createdAt: '0', lastModified: '0', version: 1 },
      }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects design system map with invalid image entry', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(
      minimalCore({
        designSystems: {
          ds1: {
            nodeId: 'n1',
            title: 'DS',
            content: 'c',
            images: [{ id: 'i1' }],
          },
        },
      }),
    );
    expect(r.success).toBe(false);
  });
});
