/**
 * Inputs-mode path in runOneMetaHarnessTest.
 */
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import type { SimplifiedMetaHarnessTestCase } from '../test-case-hydrator.ts';

const { runInputsGeneratePipelineMock } = vi.hoisted(() => ({
  runInputsGeneratePipelineMock: vi.fn(),
}));

vi.mock('../inputs-pipeline.ts', () => ({
  runInputsGeneratePipeline: runInputsGeneratePipelineMock,
}));

import { runOneMetaHarnessTest } from '../run-one-test.ts';
import { ARTIFACT } from '../constants.ts';

const testCase: SimplifiedMetaHarnessTestCase = {
  name: 'inputs-case',
  spec: {
    title: 'T',
    sections: {
      'design-brief': 'Build a dashboard for analytics',
      'existing-design': '',
      'research-context': '',
      'objectives-metrics': '',
      'design-constraints': '',
    },
  },
  model: { providerId: 'openrouter', modelId: 'test/m' },
};

const cfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001',
  iterations: 1,
  proposerModel: 'p/m',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
};

const args: MetaHarnessCliArgs = {
  mode: 'inputs',
  once: false,
  evalOnly: true,
  dryRun: false,
  plain: true,
  skipPromotionCheck: true,
  promoteOnly: false,
  testFilters: [],
};

function stubCallbacks(): RunnerCallbacks {
  const noop = (): void => {};
  return {
    onPreflight: noop,
    onIterationStart: noop,
    onProposerStart: noop,
    onProposerToolCall: noop,
    onProposerDone: noop,
    onTestCaseStart: noop,
    onWireEvent: noop,
    onTestCaseDone: noop,
    onIterationDone: noop,
    onComplete: noop,
  } as RunnerCallbacks;
}

describe('runOneMetaHarnessTest inputs mode', () => {
  let root: string;

  afterEach(async () => {
    runInputsGeneratePipelineMock.mockReset();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('calls inputs pipeline and records inputs_rubric stop reason', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-ros-'));
    runInputsGeneratePipelineMock.mockResolvedValue({
      perFacet: [
        {
          target: 'research-context',
          generated: 'Research...',
          rubric: { mean: 4.0, scores: { grounding: 4, completeness: 4, actionability: 4, conciseness: 4, briefAlignment: 4 } },
        },
        {
          target: 'objectives-metrics',
          generated: 'Objectives...',
          rubric: { mean: 3.5, scores: { grounding: 3, completeness: 4, actionability: 3, conciseness: 4, briefAlignment: 4 } },
        },
        {
          target: 'design-constraints',
          generated: 'Constraints...',
          rubric: { mean: 4.5, scores: { grounding: 5, completeness: 4, actionability: 5, conciseness: 4, briefAlignment: 5 } },
        },
      ],
      overallMean: 4.0,
      generatedByFacet: {},
    });

    const testResultsDir = path.join(root, 'tr');
    const onTestCaseDone = vi.fn();

    const result = await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'c1',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'eval/m',
      inputsRubricModel: 'eval/m',
      incubateHypothesisCountDefault: 5,
      apiKey: 'key',
      phaseAbort: new AbortController(),
      callbacks: { ...stubCallbacks(), onTestCaseDone },
    });

    expect(result.overallScore).toBe(4.0);
    expect(result.scored).toBe(true);
    expect(runInputsGeneratePipelineMock).toHaveBeenCalledOnce();

    expect(onTestCaseDone).toHaveBeenCalledOnce();
    const call = onTestCaseDone.mock.calls[0]!;
    expect(call[1]).toBe(4.0);
    expect(call[2]).toBe('inputs_rubric');
    expect(call[5]).toBe('scored');

    const summaryPath = path.join(testResultsDir, testCase.name, ARTIFACT.summaryJson);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;
    expect(summary.harnessMode).toBe('inputs');
    expect(summary.stopReason).toBe('inputs_rubric');
    expect(summary.overallScore).toBe(4.0);
    expect(summary.mode).toBe('inputs');
    expect(Array.isArray(summary.perFacet)).toBe(true);
  });

  it('records error outcome when inputs pipeline throws', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-ros-err-'));
    runInputsGeneratePipelineMock.mockRejectedValue(new Error('API unreachable'));

    const testResultsDir = path.join(root, 'tr');
    const onTestCaseDone = vi.fn();

    const result = await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'c2',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'eval/m',
      inputsRubricModel: 'eval/m',
      incubateHypothesisCountDefault: 5,
      apiKey: 'key',
      phaseAbort: new AbortController(),
      callbacks: { ...stubCallbacks(), onTestCaseDone },
    });

    expect(result.scored).toBe(false);
    expect(result.overallScore).toBeNull();

    expect(onTestCaseDone.mock.calls[0]![4]).toContain('API unreachable');
    expect(onTestCaseDone.mock.calls[0]![5]).toBe('error');

    const summaryPath = path.join(testResultsDir, testCase.name, ARTIFACT.summaryJson);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;
    expect(summary.errorMessage).toContain('API unreachable');
  });

  it('passes inputs callbacks through to the pipeline', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-ros-cb-'));
    runInputsGeneratePipelineMock.mockImplementation(async (params: Record<string, unknown>) => {
      const onStart = params.onInputsGenerateStart as ((t: string) => void) | undefined;
      const onDone = params.onInputsGenerateDone as ((t: string, n: number) => void) | undefined;
      const onRubric = params.onInputsRubricDone as ((t: string, m: number) => void) | undefined;
      onStart?.('research-context');
      onDone?.('research-context', 100);
      onRubric?.('research-context', 4.0);
      return {
        perFacet: [
          { target: 'research-context', generated: 'R', rubric: { mean: 4.0, scores: {} } },
          { target: 'objectives-metrics', generated: 'O', rubric: { mean: 3.0, scores: {} } },
          { target: 'design-constraints', generated: 'C', rubric: { mean: 3.5, scores: {} } },
        ],
        overallMean: 3.5,
        generatedByFacet: {},
      };
    });

    const onInputsGenerateStart = vi.fn();
    const onInputsGenerateDone = vi.fn();
    const onInputsRubricDone = vi.fn();

    const testResultsDir = path.join(root, 'tr');
    await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'c3',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'eval/m',
      inputsRubricModel: 'eval/m',
      incubateHypothesisCountDefault: 5,
      apiKey: 'key',
      phaseAbort: new AbortController(),
      callbacks: {
        ...stubCallbacks(),
        onInputsGenerateStart,
        onInputsGenerateDone,
        onInputsRubricDone,
      },
    });

    expect(onInputsGenerateStart).toHaveBeenCalledWith(testCase.name, 'research-context');
    expect(onInputsGenerateDone).toHaveBeenCalledWith(testCase.name, 'research-context', 100);
    expect(onInputsRubricDone).toHaveBeenCalledWith(testCase.name, 'research-context', 4.0);
  });
});
