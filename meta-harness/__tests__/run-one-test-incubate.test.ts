/**
 * Compile-mode unhappy paths in runOneMetaHarnessTest (rubric errors).
 */
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import type { SimplifiedMetaHarnessTestCase } from '../test-case-hydrator.ts';
import type { IncubationPlan } from '../../src/types/incubator.ts';

const { runIncubatePipelineMock, scoreHypothesisWithRubricMock } = vi.hoisted(() => ({
  runIncubatePipelineMock: vi.fn(),
  scoreHypothesisWithRubricMock: vi.fn(),
}));

vi.mock('../incubate-pipeline.ts', () => ({
  runIncubatePipeline: runIncubatePipelineMock,
}));

vi.mock('../hypothesis-evaluator.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../hypothesis-evaluator.ts')>();
  return {
    ...mod,
    scoreHypothesisWithRubric: scoreHypothesisWithRubricMock,
  };
});

import { runOneMetaHarnessTest } from '../run-one-test.ts';
import { ARTIFACT } from '../constants.ts';

const testCase: SimplifiedMetaHarnessTestCase = {
  name: 'compile-case',
  spec: {
    title: 'T',
    sections: {
      'design-brief': 'b',
      'existing-design': '',
      'research-context': '',
      'objectives-metrics': '',
      'design-constraints': '',
    },
  },
  model: { providerId: 'openrouter', modelId: 'x/y' },
};

const plan: IncubationPlan = {
  id: 'plan-1',
  specId: 'spec',
  dimensions: [],
  hypotheses: [
    {
      id: 'h1',
      name: 'Hypothesis One',
      hypothesis: 'h',
      rationale: 'r',
      measurements: 'm',
      dimensionValues: {},
    },
  ],
  generatedAt: new Date().toISOString(),
  incubatorModel: 'cm',
};

const cfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001/api',
  iterations: 1,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
  hypothesisRubricTimeoutMs: 30_000,
};

const args: MetaHarnessCliArgs = {
  mode: 'incubate',
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

describe('runOneMetaHarnessTest incubate mode (rubric errors)', () => {
  let root: string;

  afterEach(async () => {
    runIncubatePipelineMock.mockReset();
    scoreHypothesisWithRubricMock.mockReset();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('maps AbortError from rubric to timeout-style message in summary and callback', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-roc-abort-'));
    runIncubatePipelineMock.mockResolvedValue({ plan, requestedCount: 1 });
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    scoreHypothesisWithRubricMock.mockRejectedValue(abort);

    const testResultsDir = path.join(root, 'tr');
    const onTestCaseDone = vi.fn();
    await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'c1',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'a/b',
      hypothesisEvalModel: 'rub/m',
      inputsRubricModel: 'rub/m',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      phaseAbort: new AbortController(),
      callbacks: { ...stubCallbacks(), onTestCaseDone },
    });

    expect(scoreHypothesisWithRubricMock).toHaveBeenCalled();
    expect(onTestCaseDone).toHaveBeenCalled();
    const call = onTestCaseDone.mock.calls[0]!;
    expect(call[4]).toMatch(/Hypothesis rubric timed out or was aborted/);
    expect(call[5]).toBe('error');

    const summaryPath = path.join(testResultsDir, testCase.name, ARTIFACT.summaryJson);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as { errorMessage?: string };
    expect(summary.errorMessage).toMatch(/Hypothesis rubric timed out or was aborted/);
  });

  it('records non-timeout rubric errors on summary and error outcome', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-roc-bad-'));
    runIncubatePipelineMock.mockResolvedValue({ plan, requestedCount: 1 });
    scoreHypothesisWithRubricMock.mockRejectedValue(new Error('OpenRouter: invalid response shape'));

    const testResultsDir = path.join(root, 'tr2');
    const onTestCaseDone = vi.fn();
    await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'c2',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'a/b',
      hypothesisEvalModel: 'rub/m',
      inputsRubricModel: 'rub/m',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      phaseAbort: new AbortController(),
      callbacks: { ...stubCallbacks(), onTestCaseDone },
    });

    expect(onTestCaseDone.mock.calls[0]![4]).toContain('invalid response shape');
    expect(onTestCaseDone.mock.calls[0]![5]).toBe('error');
  });

  it('writes summary with error outcome when rubric fails inside outer catch', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-roc-summary-'));
    runIncubatePipelineMock.mockResolvedValue({ plan, requestedCount: 1 });
    scoreHypothesisWithRubricMock.mockRejectedValue(new Error('rubric parse failed'));

    const testResultsDir = path.join(root, 'tr3');
    const out = await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'c3',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'a/b',
      hypothesisEvalModel: 'rub/m',
      inputsRubricModel: 'rub/m',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      phaseAbort: new AbortController(),
      callbacks: stubCallbacks(),
    });

    expect(out.scored).toBe(false);
    expect(out.overallScore).toBeNull();

    const summaryPath = path.join(testResultsDir, testCase.name, ARTIFACT.summaryJson);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as { errorMessage?: string };
    expect(summary.errorMessage).toContain('rubric parse failed');
  });
});
