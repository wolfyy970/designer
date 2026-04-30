import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimplifiedMetaHarnessTestCase } from '../test-case-hydrator.ts';

const { scoreInputsWithRubricMock } = vi.hoisted(() => ({
  scoreInputsWithRubricMock: vi.fn(),
}));

vi.mock('../inputs-evaluator.ts', () => ({
  scoreInputsWithRubric: scoreInputsWithRubricMock,
  INPUTS_RUBRIC_KEYS: ['grounding', 'completeness', 'actionability', 'conciseness', 'briefAlignment'],
}));

import { runInputsGeneratePipeline } from '../inputs-pipeline.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';

function sseTaskResultResponse(result: string): Response {
  const payload = `event: ${SSE_EVENT_NAMES.task_result}\ndata: ${JSON.stringify({ result })}\n\n`;
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const testCase: SimplifiedMetaHarnessTestCase = {
  name: 'sec-test',
  spec: {
    title: 'Checkout Redesign',
    sections: {
      'design-brief': 'Redesign the checkout flow to reduce cart abandonment.',
      'research-context': '',
      'objectives-metrics': '',
      'design-constraints': '',
    },
  },
  model: { providerId: 'openrouter', modelId: 'test/model' },
};

const rubricScores = {
  grounding: 4,
  completeness: 4,
  actionability: 3,
  conciseness: 5,
  briefAlignment: 4,
};

describe('runInputsGeneratePipeline', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scoreInputsWithRubricMock.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls inputs-generate 3x, scores each, and returns overall mean', async () => {
    fetchSpy.mockImplementation(async () => sseTaskResultResponse('Generated input content'));
    scoreInputsWithRubricMock.mockResolvedValue({ mean: 4.0, scores: rubricScores });

    const result = await runInputsGeneratePipeline({
      testCase,
      apiBaseUrl: 'http://localhost:4731/api',
      inputsGenerateProviderId: 'openrouter',
      inputsGenerateModelId: 'test/model',
      inputsRubricApiKey: 'key',
      inputsRubricModel: 'eval/model',
      timeoutMs: 5000,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(scoreInputsWithRubricMock).toHaveBeenCalledTimes(3);
    expect(result.perFacet).toHaveLength(3);
    expect(result.perFacet[0]!.target).toBe('research-context');
    expect(result.perFacet[1]!.target).toBe('objectives-metrics');
    expect(result.perFacet[2]!.target).toBe('design-constraints');
    expect(result.overallMean).toBe(4.0);
    expect(result.generatedByFacet['research-context']).toBe('Generated input content');
    expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:4731/api/inputs/generate');
  });

  it('passes cross-facet context from earlier generated inputs', async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      return sseTaskResultResponse(`Facet ${callCount}`);
    });
    scoreInputsWithRubricMock.mockResolvedValue({ mean: 3.0, scores: rubricScores });

    await runInputsGeneratePipeline({
      testCase,
      apiBaseUrl: 'http://localhost:4731/api',
      inputsGenerateProviderId: 'openrouter',
      inputsGenerateModelId: 'test/model',
      inputsRubricApiKey: 'key',
      inputsRubricModel: 'eval/model',
    });

    const secondCallBody = JSON.parse(
      (fetchSpy.mock.calls[1]![1]! as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(secondCallBody.researchContext).toBe('Facet 1');

    const thirdCallBody = JSON.parse(
      (fetchSpy.mock.calls[2]![1]! as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(thirdCallBody.researchContext).toBe('Facet 1');
    expect(thirdCallBody.objectivesMetrics).toBe('Facet 2');
  });

  it('POST body never includes legacy promptOverrides', async () => {
    fetchSpy.mockImplementation(async () => sseTaskResultResponse('Content'));
    scoreInputsWithRubricMock.mockResolvedValue({ mean: 3.0, scores: rubricScores });

    await runInputsGeneratePipeline({
      testCase,
      apiBaseUrl: 'http://localhost:4731/api',
      inputsGenerateProviderId: 'openrouter',
      inputsGenerateModelId: 'test/model',
      inputsRubricApiKey: 'key',
      inputsRubricModel: 'eval/model',
    });

    const firstBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1]! as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect('promptOverrides' in firstBody).toBe(false);
  });

  it('records error when API returns non-OK and continues', async () => {
    let callIdx = 0;
    fetchSpy.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return sseTaskResultResponse('Good content');
    });
    scoreInputsWithRubricMock.mockResolvedValue({ mean: 4.0, scores: rubricScores });

    const result = await runInputsGeneratePipeline({
      testCase,
      apiBaseUrl: 'http://localhost:4731/api',
      inputsGenerateProviderId: 'openrouter',
      inputsGenerateModelId: 'test/model',
      inputsRubricApiKey: 'key',
      inputsRubricModel: 'eval/model',
    });

    expect(result.perFacet[0]!.error).toContain('500');
    expect(result.perFacet[0]!.rubric).toBeNull();
    expect(result.perFacet[1]!.rubric).not.toBeNull();
    expect(result.perFacet[2]!.rubric).not.toBeNull();
    expect(result.overallMean).toBe(4.0);
  });

  it('throws when design-brief is empty', async () => {
    const emptyBrief: SimplifiedMetaHarnessTestCase = {
      ...testCase,
      spec: { title: 'T', sections: { 'design-brief': '  ' } },
    };

    await expect(
      runInputsGeneratePipeline({
        testCase: emptyBrief,
        apiBaseUrl: 'http://localhost:4731/api',
        inputsGenerateProviderId: 'openrouter',
        inputsGenerateModelId: 'test/model',
        inputsRubricApiKey: 'key',
        inputsRubricModel: 'eval/model',
      }),
    ).rejects.toThrow(/non-empty design-brief/);
  });

  it('invokes callbacks at each stage', async () => {
    fetchSpy.mockImplementation(async () => sseTaskResultResponse('Content'));
    scoreInputsWithRubricMock.mockResolvedValue({ mean: 3.5, scores: rubricScores });

    const onStart = vi.fn();
    const onDone = vi.fn();
    const onRubric = vi.fn();

    await runInputsGeneratePipeline({
      testCase,
      apiBaseUrl: 'http://localhost:4731/api',
      inputsGenerateProviderId: 'openrouter',
      inputsGenerateModelId: 'test/model',
      inputsRubricApiKey: 'key',
      inputsRubricModel: 'eval/model',
      onInputsGenerateStart: onStart,
      onInputsGenerateDone: onDone,
      onInputsRubricDone: onRubric,
    });

    expect(onStart).toHaveBeenCalledTimes(3);
    expect(onDone).toHaveBeenCalledTimes(3);
    expect(onRubric).toHaveBeenCalledTimes(3);
    expect(onStart.mock.calls[0]![0]).toBe('research-context');
    expect(onDone.mock.calls[1]![0]).toBe('objectives-metrics');
    expect(onRubric.mock.calls[2]![0]).toBe('design-constraints');
  });
});
