import { describe, expect, it } from 'vitest';
import {
  IncubateResponseSchema,
  HypothesisPromptBundleResponseSchema,
  DesignSystemExtractResponseSchema,
  ObservabilityLogsResponseSchema,
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
});

describe('HypothesisPromptBundleResponseSchema', () => {
  it('accepts null evaluationContext', () => {
    const r = HypothesisPromptBundleResponseSchema.safeParse({
      prompts: [],
      evaluationContext: null,
      provenance: { strategies: {} },
      generationContext: {
        agentMode: 'single',
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

describe('ObservabilityLogsResponseSchema', () => {
  it('accepts llm + trace snapshot from GET /api/logs', () => {
    const r = ObservabilityLogsResponseSchema.safeParse({
      llm: [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          source: 'incubator',
          model: 'm',
          provider: 'openrouter',
          systemPrompt: 's',
          userPrompt: 'u',
          response: 'r',
          durationMs: 0,
        },
      ],
      trace: [
        {
          v: 1,
          ts: new Date().toISOString(),
          type: 'trace',
          payload: {
            event: {
              id: 't1',
              at: new Date().toISOString(),
              kind: 'phase',
              label: 'x',
            },
            correlationId: 'run-1',
            resultId: 'res-1',
          },
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
