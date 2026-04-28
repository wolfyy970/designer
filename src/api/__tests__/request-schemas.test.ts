import { describe, expect, it } from 'vitest';
import {
  DesignSystemExtractRequestSchema,
  IncubateRequestSchema,
  InputsGenerateRequestSchema,
  InternalContextGenerateRequestSchema,
} from '../request-schemas';
import {
  HypothesisGenerateRequestSchema,
  PromptBundleRequestSchema,
} from '../hypothesis-request-schemas';

const spec = {
  id: 'spec-1',
  title: 'Spec',
  sections: {
    'design-brief': {
      id: 'design-brief',
      content: 'Brief',
      images: [],
      lastModified: '2026-01-01T00:00:00Z',
    },
  },
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  version: 1,
};

const strategy = {
  id: 'st-1',
  name: 'Strategy',
  hypothesis: 'Bet',
  rationale: 'Why',
  measurements: 'Measure',
  dimensionValues: {},
};

const hypothesisPayload = {
  hypothesisNodeId: 'h1',
  hypothesisStrategy: strategy,
  spec,
  snapshot: { nodes: [], edges: [] },
  domainHypothesis: null,
  modelProfiles: {},
  designSystems: {},
  defaultIncubatorProvider: 'openrouter',
};

describe('shared request schemas', () => {
  it('accepts current task route request shapes', () => {
    expect(InputsGenerateRequestSchema.safeParse({
      inputId: 'research-context',
      designBrief: 'Brief',
      providerId: 'openrouter',
      modelId: 'model',
    }).success).toBe(true);

    expect(InternalContextGenerateRequestSchema.safeParse({
      spec,
      sourceHash: 'fnv1a:abc',
      providerId: 'openrouter',
      modelId: 'model',
    }).success).toBe(true);

    expect(DesignSystemExtractRequestSchema.safeParse({
      content: 'Use red buttons.',
      providerId: 'openrouter',
      modelId: 'model',
    }).success).toBe(true);

    expect(IncubateRequestSchema.safeParse({
      spec,
      providerId: 'openrouter',
      modelId: 'model',
      promptOptions: { count: 3, existingStrategies: [strategy] },
    }).success).toBe(true);
  });

  it('preserves legacy hypothesis strategy field compatibility', () => {
    expect(PromptBundleRequestSchema.safeParse(hypothesisPayload).success).toBe(true);
    expect(HypothesisGenerateRequestSchema.safeParse({
      ...hypothesisPayload,
      correlationId: 'run-1',
      rubricWeights: { design: 1 },
    }).success).toBe(true);
  });

  it('rejects invalid request shapes at shared boundaries', () => {
    expect(InputsGenerateRequestSchema.safeParse({
      inputId: 'design-brief',
      designBrief: 'Brief',
      providerId: 'openrouter',
      modelId: 'model',
    }).success).toBe(false);

    expect(DesignSystemExtractRequestSchema.safeParse({
      providerId: 'openrouter',
      modelId: 'model',
    }).success).toBe(false);

    expect(PromptBundleRequestSchema.safeParse({
      ...hypothesisPayload,
      hypothesisStrategy: undefined,
    }).success).toBe(false);
  });
});
