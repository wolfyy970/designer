import { describe, expect, it } from 'vitest';
import {
  IncubateResponseSchema,
  HypothesisPromptBundleResponseSchema,
  DesignSystemExtractResponseSchema,
} from '../response-schemas';

describe('IncubateResponseSchema', () => {
  it('accepts plan shaped like POST /api/incubate SSE incubate_result payload', () => {
    const r = IncubateResponseSchema.safeParse({
      id: 'plan-sse',
      specId: 's-sse',
      dimensions: [],
      hypotheses: [
        {
          id: 'h1',
          name: 'N',
          hypothesis: 'hyp',
          rationale: 'r',
          measurements: 'm',
          dimensionValues: { axis: 'v' },
        },
      ],
      generatedAt: '2026-01-01T00:00:00.000Z',
      incubatorModel: 'openrouter/x',
    });
    expect(r.success).toBe(true);
  });

  it('accepts minimal incubation plan', () => {
    const r = IncubateResponseSchema.safeParse({
      id: 'd1',
      specId: 's1',
      dimensions: [{ name: 'a', range: '1', isConstant: false }],
      hypotheses: [
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
      incubatorModel: 'm',
    });
    expect(r.success).toBe(true);
  });

  it('accepts dimensions with range as string array (coerced to comma-separated string)', () => {
    const r = IncubateResponseSchema.safeParse({
      id: 'd2',
      specId: 's2',
      dimensions: [
        {
          name: 'Flow Approach',
          range: ['automated-then-review', 'step-by-step guided flow'],
          isConstant: false,
        },
      ],
      hypotheses: [
        {
          id: 'v2',
          name: 'H',
          hypothesis: 'bet',
          rationale: 'r',
          measurements: 'm',
          dimensionValues: {},
        },
      ],
      generatedAt: 'now',
      incubatorModel: 'm',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dimensions[0]!.range).toBe(
        'automated-then-review, step-by-step guided flow',
      );
    }
  });
});

describe('HypothesisPromptBundleResponseSchema', () => {
  it('accepts null evaluationContext', () => {
    const r = HypothesisPromptBundleResponseSchema.safeParse({
      prompts: [],
      evaluationContext: null,
      provenance: { strategies: {} },
      generationContext: {
        modelCredentials: [{ providerId: 'p', modelId: 'm', thinkingLevel: 'minimal' as const }],
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

