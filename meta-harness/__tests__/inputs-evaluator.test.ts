import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreInputsWithRubric, INPUTS_RUBRIC_KEYS } from '../inputs-evaluator.ts';

vi.mock('../openrouter-client.ts', () => ({
  fetchOpenRouterChat: vi.fn(),
}));

import { fetchOpenRouterChat } from '../openrouter-client.ts';

const mockFetch = vi.mocked(fetchOpenRouterChat);

describe('scoreInputsWithRubric', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses rubric JSON and returns mean of 5 dimensions', async () => {
    const json = {
      grounding: 5,
      completeness: 4,
      actionability: 3,
      conciseness: 4,
      briefAlignment: 4,
    };
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    const result = await scoreInputsWithRubric({
      apiKey: 'k',
      model: 'm',
      inputFacetId: 'research-context',
      designBrief: 'Build a checkout flow',
      generatedContent: 'Research shows users want faster checkout...',
    });

    expect(result.mean).toBeCloseTo(20 / 5, 5);
    expect(result.scores.grounding).toBe(5);
    expect(result.scores.conciseness).toBe(4);
    expect(Object.keys(result.scores)).toHaveLength(INPUTS_RUBRIC_KEYS.length);
  });

  it('extracts JSON from fenced code block', async () => {
    const json = {
      grounding: 3,
      completeness: 3,
      actionability: 3,
      conciseness: 3,
      briefAlignment: 3,
    };
    const fenced = '```json\n' + JSON.stringify(json) + '\n```';
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: fenced } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    const result = await scoreInputsWithRubric({
      apiKey: 'k',
      model: 'm',
      inputFacetId: 'objectives-metrics',
      designBrief: 'Brief',
      generatedContent: 'Objectives...',
    });

    expect(result.mean).toBe(3);
  });

  it('throws on empty content', async () => {
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    await expect(
      scoreInputsWithRubric({
        apiKey: 'k',
        model: 'm',
        inputFacetId: 'design-constraints',
        designBrief: 'Brief',
        generatedContent: 'Constraints...',
      }),
    ).rejects.toThrow(/empty content/i);
  });

  it('throws on invalid rubric JSON (scores out of range)', async () => {
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: '{"grounding": 99}' } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    await expect(
      scoreInputsWithRubric({
        apiKey: 'k',
        model: 'm',
        inputFacetId: 'research-context',
        designBrief: 'Brief',
        generatedContent: 'Content',
      }),
    ).rejects.toThrow();
  });

  it('throws on non-JSON content', async () => {
    mockFetch.mockResolvedValue({
      choices: [{ message: { content: 'This input is great!' } }],
    } as Awaited<ReturnType<typeof fetchOpenRouterChat>>);

    await expect(
      scoreInputsWithRubric({
        apiKey: 'k',
        model: 'm',
        inputFacetId: 'research-context',
        designBrief: 'Brief',
        generatedContent: 'Content',
      }),
    ).rejects.toThrow(/Could not parse JSON/);
  });
});
