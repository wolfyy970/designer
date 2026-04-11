/**
 * Stubbed success path for runMetaHarnessEngine (eval-only iteration, no baseline).
 */
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';

const { listTestCaseFilesMock, createMetaHarnessSessionMock, runTestCasesEvaluationMock } = vi.hoisted(
  () => ({
    listTestCaseFilesMock: vi.fn(),
    createMetaHarnessSessionMock: vi.fn(),
    runTestCasesEvaluationMock: vi.fn(),
  }),
);

vi.mock('../session.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../session.ts')>();
  return {
    ...mod,
    listTestCaseFiles: listTestCaseFilesMock,
    createMetaHarnessSession: createMetaHarnessSessionMock,
  };
});

vi.mock('../candidate-eval.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../candidate-eval.ts')>();
  return {
    ...mod,
    runTestCasesEvaluation: runTestCasesEvaluationMock,
  };
});

import { runMetaHarnessEngine } from '../runner-core.ts';

const baseCfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001/api',
  iterations: 1,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
};

describe('runMetaHarnessEngine smoke (stubbed test-case eval)', () => {
  const origKey = process.env.OPENROUTER_API_KEY;
  let sessionDir: string;

  beforeEach(async () => {
    listTestCaseFilesMock.mockReset();
    createMetaHarnessSessionMock.mockReset();
    runTestCasesEvaluationMock.mockReset();
    sessionDir = await mkdtemp(path.join(tmpdir(), 'mh-engine-smoke-'));
    createMetaHarnessSessionMock.mockResolvedValue({
      sessionDir,
      sessionFolderName: 'session-smoke',
    });
    listTestCaseFilesMock.mockResolvedValue([path.join('meta-harness', 'test-cases', 'alpha.json')]);
    delete process.env.OPENROUTER_API_KEY;

    runTestCasesEvaluationMock.mockImplementation(async (params) => {
      const testResultsDir = path.join(params.candidateDir, 'test-results');
      await mkdir(testResultsDir, { recursive: true });
      return { meanScore: 4.5, scores: [4.5], testResultsDir };
    });
  });

  afterEach(async () => {
    await rm(sessionDir, { recursive: true, force: true });
    if (origKey !== undefined) process.env.OPENROUTER_API_KEY = origKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  it('runs one eval-only iteration and completes with best candidate', async () => {
    const onPreflight = vi.fn();
    const onIterationStart = vi.fn();
    const onComplete = vi.fn();

    const args: MetaHarnessCliArgs = {
      mode: 'design',
      once: true,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    const callbacks: RunnerCallbacks = {
      onPreflight,
      onIterationStart,
      onProposerStart: vi.fn(),
      onProposerToolCall: vi.fn(),
      onProposerDone: vi.fn(),
      onTestCaseStart: vi.fn(),
      onWireEvent: vi.fn(),
      onTestCaseDone: vi.fn(),
      onIterationDone: vi.fn(),
      onComplete,
    } as unknown as RunnerCallbacks;

    await runMetaHarnessEngine(args, callbacks, { config: baseCfg });

    expect(onPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        evalOnly: true,
        baselineWillRun: false,
      }),
    );
    expect(onIterationStart).toHaveBeenCalledWith(1, 1, 1);

    expect(runTestCasesEvaluationMock).toHaveBeenCalledTimes(1);
    const evalParams = runTestCasesEvaluationMock.mock.calls[0]![0];
    expect(evalParams.candidateId).toBe(1);
    expect(evalParams.args.evalOnly).toBe(true);

    expect(onComplete).toHaveBeenCalledWith(
      1,
      4.5,
      expect.any(String),
      expect.any(String),
    );
  });
});
