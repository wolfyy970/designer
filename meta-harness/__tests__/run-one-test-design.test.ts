/**
 * Design-mode paths in runOneMetaHarnessTest with evaluator stubbed (no HTTP).
 */
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import type { SimplifiedMetaHarnessTestCase } from '../test-case-hydrator.ts';
import type { AggregatedEvaluationReport } from '../../src/types/evaluation.ts';

const { runHypothesisEvalFromMetaHarnessMock } = vi.hoisted(() => ({
  runHypothesisEvalFromMetaHarnessMock: vi.fn(),
}));

vi.mock('../evaluator.ts', () => ({
  runHypothesisEvalFromMetaHarness: runHypothesisEvalFromMetaHarnessMock,
}));

import { runOneMetaHarnessTest } from '../run-one-test.ts';
import { ARTIFACT, REVISION_BRIEF_MAX_CHARS } from '../constants.ts';

const strategy = {
  id: 's1',
  name: 'S',
  hypothesis: 'h',
  rationale: 'r',
  measurements: 'm',
  dimensionValues: {},
};

const testCase: SimplifiedMetaHarnessTestCase = {
  name: 'design-case',
  spec: {
    title: 'T',
    sections: {
      'design-brief': 'b',
      'research-context': '',
      'objectives-metrics': '',
      'design-constraints': '',
    },
  },
  model: { providerId: 'openrouter', modelId: 'x/y' },
  strategy,
};

const cfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:4731/api',
  iterations: 1,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
};

const args: MetaHarnessCliArgs = {
  mode: 'design',
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

describe('runOneMetaHarnessTest design mode (evaluator stubbed)', () => {
  let root: string;

  afterEach(async () => {
    runHypothesisEvalFromMetaHarnessMock.mockReset();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('caps revisionBrief in summary.json to REVISION_BRIEF_MAX_CHARS', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-rod-rev-'));
    const longBrief = 'z'.repeat(REVISION_BRIEF_MAX_CHARS + 400);
    const finalAggregate: AggregatedEvaluationReport = {
      overallScore: 6,
      normalizedScores: { design: 0.5 },
      hardFails: [],
      prioritizedFixes: [],
      shouldRevise: false,
      revisionBrief: longBrief,
    };
    runHypothesisEvalFromMetaHarnessMock.mockResolvedValue({
      baseCorrelationId: 'base-cid',
      laneCorrelationId: 'lane-cid',
      overallScore: 6.5,
      stopReason: 'satisfied',
      finalAggregate,
      evalRunDir: null,
      sseErrors: [],
    });

    const testResultsDir = path.join(root, 'tr');
    await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'corr-1',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 1,
      apiKey: 'k',
      phaseAbort: new AbortController(),
      callbacks: stubCallbacks(),
    });

    const raw = JSON.parse(
      await readFile(path.join(testResultsDir, testCase.name, ARTIFACT.summaryJson), 'utf8'),
    ) as { revisionBrief?: string; overallScore?: number };
    expect(raw.revisionBrief).toBeDefined();
    expect(raw.revisionBrief!.length).toBe(REVISION_BRIEF_MAX_CHARS);
    expect(raw.overallScore).toBe(6.5);
    expect(runHypothesisEvalFromMetaHarnessMock).toHaveBeenCalledTimes(1);
  });

  it('records evaluator errorMessage in summary and onTestCaseDone outcome error', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-rod-err-'));
    runHypothesisEvalFromMetaHarnessMock.mockResolvedValue({
      baseCorrelationId: 'base',
      laneCorrelationId: 'lane',
      overallScore: null,
      stopReason: null,
      finalAggregate: null,
      errorMessage: 'SSE: upstream failed',
      evalRunDir: null,
      sseErrors: ['e1'],
    });

    const onTestCaseDone = vi.fn();
    const testResultsDir = path.join(root, 'tr');
    await runOneMetaHarnessTest(args, cfg, testCase, {
      name: testCase.name,
      correlationId: 'corr-2',
      evalStart: Date.now(),
      testResultsDir,
      evalRunsBase: path.join(root, 'eval'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 1,
      apiKey: 'k',
      phaseAbort: new AbortController(),
      callbacks: { ...stubCallbacks(), onTestCaseDone },
    });

    const raw = JSON.parse(
      await readFile(path.join(testResultsDir, testCase.name, ARTIFACT.summaryJson), 'utf8'),
    ) as { errorMessage?: string; sseErrors?: string[] };
    expect(raw.errorMessage).toContain('upstream failed');
    expect(raw.sseErrors).toEqual(['e1']);

    expect(onTestCaseDone).toHaveBeenCalledWith(
      testCase.name,
      null,
      null,
      expect.any(Number),
      'SSE: upstream failed',
      'error',
    );
  });
});
