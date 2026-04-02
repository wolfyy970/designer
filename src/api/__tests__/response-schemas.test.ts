import { describe, expect, it } from 'vitest';
import {
  CompileResponseSchema,
  HypothesisPromptBundleResponseSchema,
  DesignSystemExtractResponseSchema,
  ObservabilityLogsResponseSchema,
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
          source: 'compiler',
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
