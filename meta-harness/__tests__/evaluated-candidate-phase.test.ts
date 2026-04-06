import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIFACT } from '../constants.ts';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import type { CandidateScoreRow } from '../promotion-report.ts';

const { mockRunTestCasesEvaluation } = vi.hoisted(() => ({
  mockRunTestCasesEvaluation: vi.fn(),
}));

vi.mock('../candidate-eval.ts', () => ({
  runTestCasesEvaluation: mockRunTestCasesEvaluation,
}));

import * as session from '../session.ts';
import { runEvaluatedCandidatePhase } from '../runner-core.ts';
import { AggregateJsonSchema } from '../schemas.ts';

function stubCallbacks(partial: Partial<RunnerCallbacks> = {}): RunnerCallbacks {
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
    ...partial,
  } as RunnerCallbacks;
}

const baseCfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001/api',
  iterations: 2,
  proposerModel: 'test/model',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
};

const baseArgs: MetaHarnessCliArgs = {
  mode: 'incubate',
  once: false,
  evalOnly: false,
  dryRun: false,
  plain: true,
  skipPromotionCheck: false,
  promoteOnly: false,
  testFilters: [],
};

describe('runEvaluatedCandidatePhase', () => {
  let roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.map((r) =>
        rm(r, { recursive: true, force: true }).catch(() => {
          /* temp cleanup */
        }),
      ),
    );
    roots = [];
    mockRunTestCasesEvaluation.mockReset();
  });

  beforeEach(() => {
    mockRunTestCasesEvaluation.mockImplementation(
      async ({ candidateId, candidateDir }: { candidateId: number; candidateDir: string }) => {
        const testResultsDir = path.join(candidateDir, 'test-results');
        const tc = 'case-a';
        await mkdir(path.join(testResultsDir, tc), { recursive: true });
        const mean = candidateId === 0 ? 6 : 8;
        await writeFile(
          path.join(testResultsDir, tc, ARTIFACT.summaryJson),
          JSON.stringify({ overallScore: mean, stopReason: 'ok' }),
          'utf8',
        );
        return { meanScore: mean, scores: [mean], testResultsDir };
      },
    );
  });

  it('baseline and iteration-style runs write the same artifact layout', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-ecp-'));
    roots.push(root);

    const historyDir = path.join(root, 'history', 'session-test');
    await mkdir(historyDir, { recursive: true });

    const skillsDir = path.join(root, 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, 'SKILL.md'), '# skill\n', 'utf8');

    const testFile = path.join(root, 'case-a.json');
    await writeFile(testFile, '{}', 'utf8');

    const candidateRows: CandidateScoreRow[] = [];
    const bestRef = { mean: -1, id: -1 };
    const iterations = 2;
    const onIterationDone = vi.fn();

    const candidateDir0 = path.join(historyDir, 'candidate-0');
    await mkdir(candidateDir0, { recursive: true });

    await runEvaluatedCandidatePhase({
      root,
      historyDir,
      args: baseArgs,
      cfg: baseCfg,
      callbacks: stubCallbacks({ onIterationDone }),
      testFiles: [testFile],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      iterations,
      candidateRows,
      bestRef,
      candidateId: 0,
      candidateDir: candidateDir0,
      label: 'candidate-0 (baseline)',
      proposalMd: '',
      promptOverrides: {},
      iteration: 0,
      iterationLine: 'baseline',
      includeProposerSection: false,
    });

    expect(mockRunTestCasesEvaluation).toHaveBeenCalledTimes(1);
    const snap0 = await readFile(path.join(candidateDir0, 'skills-snapshot', 'SKILL.md'), 'utf8');
    expect(snap0).toBe('# skill\n');

    const agg0Raw = JSON.parse(
      await readFile(path.join(candidateDir0, ARTIFACT.aggregateJson), 'utf8'),
    ) as unknown;
    expect(AggregateJsonSchema.safeParse(agg0Raw).success).toBe(true);
    expect(agg0Raw).toMatchObject({ candidateId: 0, meanScore: 6, scores: [6], iteration: 0 });

    const changelog0 = await readFile(path.join(candidateDir0, ARTIFACT.changelogMd), 'utf8');
    expect(changelog0).toContain('candidate-0');
    expect(changelog0).not.toContain('What the proposer changed');

    const candidateDir1 = path.join(historyDir, 'candidate-1');
    await mkdir(candidateDir1, { recursive: true });

    await runEvaluatedCandidatePhase({
      root,
      historyDir,
      args: baseArgs,
      cfg: baseCfg,
      callbacks: stubCallbacks({ onIterationDone }),
      testFiles: [testFile],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      iterations,
      candidateRows,
      bestRef,
      candidateId: 1,
      candidateDir: candidateDir1,
      label: 'candidate-1 (loop 1/2)',
      proposalMd: 'tuned prompts',
      promptOverrides: { 'hypotheses-generator-system': 'body' },
      iteration: 1,
      iterationLine: '1 / 2',
      includeProposerSection: true,
    });

    expect(mockRunTestCasesEvaluation).toHaveBeenCalledTimes(2);
    await readFile(path.join(candidateDir1, 'skills-snapshot', 'SKILL.md'), 'utf8');

    const agg1Raw = JSON.parse(
      await readFile(path.join(candidateDir1, ARTIFACT.aggregateJson), 'utf8'),
    ) as unknown;
    expect(AggregateJsonSchema.safeParse(agg1Raw).success).toBe(true);
    expect(agg1Raw).toMatchObject({ candidateId: 1, meanScore: 8, scores: [8], iteration: 1 });

    const changelog1 = await readFile(path.join(candidateDir1, ARTIFACT.changelogMd), 'utf8');
    expect(changelog1).toContain('What the proposer changed');
    expect(changelog1).toContain('tuned prompts');
    expect(changelog1).toContain('hypotheses-generator-system');

    expect(candidateRows).toEqual([
      { candidateId: 0, meanScore: 6, iteration: 0 },
      { candidateId: 1, meanScore: 8, iteration: 1 },
    ]);
    expect(bestRef).toEqual({ mean: 8, id: 1 });

    const bestRaw = JSON.parse(await readFile(path.join(historyDir, ARTIFACT.bestCandidateJson), 'utf8'));
    expect(bestRaw.candidateId).toBe(1);
    expect(bestRaw.meanScore).toBe(8);

    expect(onIterationDone).toHaveBeenCalledTimes(2);
    expect(onIterationDone.mock.calls[0]![0].isBest).toBe(true);
    expect(onIterationDone.mock.calls[1]![0].isBest).toBe(true);
  });

  it('does not update best candidate when meanScore is null', async () => {
    const root = path.join(tmpdir(), `mh-ecp-null-${Date.now()}`);
    roots.push(root);
    await mkdir(path.join(root, 'skills'), { recursive: true });
    await writeFile(path.join(root, 'skills', 'SKILL.md'), 'x', 'utf8');

    const historyDir = path.join(root, 'h', 's');
    await mkdir(historyDir, { recursive: true });
    const candidateDir = path.join(historyDir, 'candidate-2');
    await mkdir(candidateDir, { recursive: true });
    const testFile = path.join(root, 't.json');
    await writeFile(testFile, '{}', 'utf8');

    mockRunTestCasesEvaluation.mockImplementation(async ({ candidateDir: cdir }) => {
      const testResultsDir = path.join(cdir, 'tr');
      await mkdir(path.join(testResultsDir, 't'), { recursive: true });
      await writeFile(
        path.join(testResultsDir, 't', ARTIFACT.summaryJson),
        JSON.stringify({ overallScore: null, stopReason: 'n/a' }),
        'utf8',
      );
      return { meanScore: null, scores: [], testResultsDir };
    });

    const bestRef = { mean: 5, id: 0 };
    const onIterationDone = vi.fn();

    await runEvaluatedCandidatePhase({
      root,
      historyDir,
      args: baseArgs,
      cfg: baseCfg,
      callbacks: stubCallbacks({ onIterationDone }),
      testFiles: [testFile],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      iterations: 1,
      candidateRows: [],
      bestRef,
      candidateId: 2,
      candidateDir,
      label: 'c2',
      proposalMd: '',
      promptOverrides: {},
      iteration: 1,
      iterationLine: '1 / 1',
      includeProposerSection: false,
    });

    expect(bestRef).toEqual({ mean: 5, id: 0 });
    expect(onIterationDone.mock.calls[0]![0].isBest).toBe(false);
    expect(onIterationDone.mock.calls[0]![0].bestCandidateId).toBe(0);
  });

  it('tie on mean score keeps baseline; writeBestCandidate not called again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-ecp-tie-'));
    roots.push(root);
    await mkdir(path.join(root, 'skills'), { recursive: true });
    await writeFile(path.join(root, 'skills', 'SKILL.md'), 'x', 'utf8');

    const historyDir = path.join(root, 'h', 's');
    await mkdir(historyDir, { recursive: true });
    const testFile = path.join(root, 't.json');
    await writeFile(testFile, '{}', 'utf8');

    mockRunTestCasesEvaluation.mockImplementation(
      async ({ candidateId, candidateDir }: { candidateId: number; candidateDir: string }) => {
        const testResultsDir = path.join(candidateDir, 'tr');
        const tc = 'case-a';
        await mkdir(path.join(testResultsDir, tc), { recursive: true });
        await writeFile(
          path.join(testResultsDir, tc, ARTIFACT.summaryJson),
          JSON.stringify({ overallScore: 4.4, stopReason: 'ok' }),
          'utf8',
        );
        void candidateId;
        return { meanScore: 4.4, scores: [4.4], testResultsDir };
      },
    );

    const wb = vi.spyOn(session, 'writeBestCandidate').mockResolvedValue(undefined);

    const candidateRows: CandidateScoreRow[] = [];
    const bestRef = { mean: -1, id: -1 };

    const candidateDir0 = path.join(historyDir, 'candidate-0');
    await mkdir(candidateDir0, { recursive: true });
    await runEvaluatedCandidatePhase({
      root,
      historyDir,
      args: baseArgs,
      cfg: baseCfg,
      callbacks: stubCallbacks(),
      testFiles: [testFile],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      iterations: 2,
      candidateRows,
      bestRef,
      candidateId: 0,
      candidateDir: candidateDir0,
      label: 'baseline',
      proposalMd: '',
      promptOverrides: {},
      iteration: 0,
      iterationLine: 'baseline',
      includeProposerSection: false,
    });

    expect(bestRef).toEqual({ mean: 4.4, id: 0 });
    expect(wb).toHaveBeenCalledTimes(1);

    const candidateDir1 = path.join(historyDir, 'candidate-1');
    await mkdir(candidateDir1, { recursive: true });
    const onIterationDone = vi.fn();
    await runEvaluatedCandidatePhase({
      root,
      historyDir,
      args: baseArgs,
      cfg: baseCfg,
      callbacks: stubCallbacks({ onIterationDone }),
      testFiles: [testFile],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 5,
      apiKey: 'k',
      iterations: 2,
      candidateRows,
      bestRef,
      candidateId: 1,
      candidateDir: candidateDir1,
      label: 'c1',
      proposalMd: '',
      promptOverrides: {},
      iteration: 1,
      iterationLine: '1 / 2',
      includeProposerSection: false,
    });

    expect(bestRef).toEqual({ mean: 4.4, id: 0 });
    expect(wb).toHaveBeenCalledTimes(1);
    expect(onIterationDone.mock.calls[0]![0].isBest).toBe(false);
    expect(onIterationDone.mock.calls[0]![0].bestCandidateId).toBe(0);

    wb.mockRestore();
  });
});
