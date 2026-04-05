import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  designSpecToEvalContext,
  scoreHypothesisWithRubric,
} from '../hypothesis-evaluator.ts';
import type { DesignSpec } from '../../src/types/spec.ts';
import type { HypothesisStrategy } from '../../src/types/compiler.ts';

vi.mock('../openrouter-client.ts', () => ({
  fetchOpenRouterChat: vi.fn(),
}));

import { fetchOpenRouterChat } from '../openrouter-client.ts';

const mockFetch = vi.mocked(fetchOpenRouterChat);

function minimalSpec(): DesignSpec {
  return {
    id: 'spec-1',
    title: 'Hello',
    sections: {
      'design-brief': {
        id: 'design-brief',
        content: 'Build a thing',
        images: [],
        lastModified: 't',
      },
    },
    createdAt: 't',
    lastModified: 't',
    version: 1,
  };
}

const sampleHypothesis: HypothesisStrategy = {
  id: 'h1',
  name: 'H1',
  hypothesis: 'Users need faster checkout',
  rationale: 'It reduces drop-off',
  measurements: 'Time to complete',
  dimensionValues: { speed: 'high' },
};

describe('designSpecToEvalContext', () => {
  it('includes title and sections that have content', () => {
    const ctx = designSpecToEvalContext(minimalSpec());
    expect(ctx).toContain('# Hello');
    expect(ctx).toContain('design brief');
    expect(ctx).toContain('Build a thing');
  });
});

describe('scoreHypothesisWithRubric', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses JSON from model content and returns mean', async () => {
    const json = {
      specificity: 4,
      testability: 5,
      briefAlignment: 4,
      creativeQuality: 3,
      measurementClarity: 4,
      dimensionCoherence: 4,
    };
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    const out = await scoreHypothesisWithRubric({
      apiKey: 'k',
      model: 'm',
      specContext: 'ctx',
      hypothesis: sampleHypothesis,
    });

    expect(out.mean).toBeCloseTo(24 / 6, 5);
    expect(out.scores.specificity).toBe(4);
  });

  it('throws when rubric JSON is invalid', async () => {
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: '{"specificity": 99}' } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    await expect(
      scoreHypothesisWithRubric({
        apiKey: 'k',
        model: 'm',
        specContext: 'ctx',
        hypothesis: sampleHypothesis,
      }),
    ).rejects.toThrow();
  });
});
