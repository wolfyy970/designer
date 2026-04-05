import { describe, it, expect } from 'vitest';
import { createInitialState, reduceRunnerState } from '../state.ts';
import type { RunnerPreflightInfo } from '../../runner-core.ts';

const samplePreflight = (names: string[]): RunnerPreflightInfo => ({
  cfg: {
    apiBaseUrl: 'http://x',
    iterations: 1,
    proposerModel: 'm',
    proposerMaxToolRounds: 3,
    defaultCompilerProvider: 'p',
  },
  mode: 'design',
  iterations: 1,
  testCaseNames: names,
  evalRunsBase: '/tmp',
  evalOnly: false,
  testFilters: [],
  baselineWillRun: false,
});

describe('reduceRunnerState HEARTBEAT', () => {
  it('updates lastHeartbeatSec for the named test row', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['alpha']) });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 1, name: 'alpha' });
    s = reduceRunnerState(s, { type: 'HEARTBEAT', testName: 'alpha', elapsedSec: 7 });
    const row = s.testRows.find((r) => r.name === 'alpha');
    expect(row?.lastHeartbeatSec).toBe(7);
  });

  it('TEST_DONE with error marks row error and exposes message', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['t1']) });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 1, name: 't1' });
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 't1',
      score: null,
      stopReason: 'x',
      elapsedMs: 1000,
      error: 'compile failed hard',
    });
    const row = s.testRows.find((r) => r.name === 't1');
    expect(row?.status).toBe('error');
    expect(row?.liveLine).toContain('compile failed');
  });

  it('SKIPPED_TEST matches basename to test row', () => {
    let s = reduceRunnerState(createInitialState(), {
      type: 'PREFLIGHT',
      payload: samplePreflight(['case-a']),
    });
    s = reduceRunnerState(s, {
      type: 'SKIPPED_TEST',
      filePath: '/tmp/meta-harness/test-cases/case-a.json',
      message: 'bad shape',
    });
    const row = s.testRows.find((r) => r.name === 'case-a');
    expect(row?.status).toBe('skipped');
    expect(row?.skipReason).toContain('bad shape');
  });

  it('ITERATION_DONE appends summary row and best tracking', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['x']) });
    s = reduceRunnerState(s, {
      type: 'ITERATION_DONE',
      candidateId: 2,
      meanScore: 3.5,
      isBest: true,
      bestCandidateId: 2,
      bestMeanScore: 3.5,
      changelogRelPath: 'CHANGELOG.md',
      label: 'candidate-2',
    });
    expect(s.summaryRows).toEqual([{ candidateId: 2, meanScore: 3.5 }]);
    expect(s.bestCandidateId).toBe(2);
    expect(s.newBestThisIteration).toBe(true);
  });
});
