import { describe, expect, it } from 'vitest';
import {
  CompileResponseSchema,
  HypothesisPromptBundleResponseSchema,
  DesignSystemExtractResponseSchema,
} from '../response-schemas';

describe('CompileResponseSchema', () => {
  it('accepts minimal dimension map', () => {
    const r = CompileResponseSchema.safeParse({
      id: 'd1',
      specId: 's1',
      dimensions: [{ name: 'a', range: '1', isConstant: false }],
      variants: [
        {
          id: 'v1',
          name: 'V',
          hypothesis: 'h',
          rationale: 'r',
          measurements: 'm',
          dimensionValues: {},
        },
      ],
      generatedAt: 'now',
      compilerModel: 'm',
    });
    expect(r.success).toBe(true);
  });
});

describe('HypothesisPromptBundleResponseSchema', () => {
  it('accepts null evaluationContext', () => {
    const r = HypothesisPromptBundleResponseSchema.safeParse({
      prompts: [],
      evaluationContext: null,
      provenance: { strategies: {} },
      generationContext: {
        agentMode: 'single',
        modelCredentials: [{ providerId: 'p', modelId: 'm' }],
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('DesignSystemExtractResponseSchema', () => {
  it('requires result string', () => {
    expect(DesignSystemExtractResponseSchema.safeParse({ result: 'x' }).success).toBe(true);
    expect(DesignSystemExtractResponseSchema.safeParse({}).success).toBe(false);
  });
});
