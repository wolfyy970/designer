import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  globalPhaseAfterTestWork,
  reduceRunnerState,
  type TestRowState,
} from '../state.ts';
import type { RunnerPreflightInfo } from '../../runner-types.ts';

const samplePreflight = (names: string[]): RunnerPreflightInfo => ({
  cfg: {
    apiBaseUrl: 'http://x',
    iterations: 1,
    proposerModel: 'm',
    proposerMaxToolRounds: 3,
    defaultIncubatorProvider: 'p',
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

  it('TEST_DONE with score null and no error marks row unscored (warning)', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['t1']) });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 1, name: 't1' });
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 't1',
      score: null,
      stopReason: 'ok',
      elapsedMs: 2000,
    });
    const row = s.testRows.find((r) => r.name === 't1');
    expect(row?.status).toBe('unscored');
    expect(row?.liveLine).toContain('no score');
  });

  it('TEST_DONE with outcome unscored is explicit', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['u']) });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 1, name: 'u' });
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 'u',
      score: null,
      stopReason: 'x',
      elapsedMs: 100,
      outcome: 'unscored',
    });
    expect(s.testRows.find((r) => r.name === 'u')?.status).toBe('unscored');
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
    expect(row?.phase).toBeNull();
  });

  it('TEST_DONE clears stale SSE liveLine/phase and updates globalPhase when more tests remain', () => {
    let s = reduceRunnerState(createInitialState(), {
      type: 'PREFLIGHT',
      payload: samplePreflight(['a', 'b']),
    });
    s = reduceRunnerState(s, { type: 'ITERATION_START', candidateId: 1, iteration: 1, total: 1 });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 2, name: 'a' });
    s = reduceRunnerState(s, {
      type: 'WIRE',
      testName: 'a',
      event: 'progress',
      payload: { status: 'Working on test 1' },
    });
    expect(s.testRows[0]?.liveLine).toContain('Working on test 1');
    expect(s.globalPhase).toBe('test 1/2');
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 'a',
      score: 2,
      stopReason: 'ok',
      elapsedMs: 1000,
    });
    expect(s.testRows[0]?.liveLine).toBe('');
    expect(s.testRows[0]?.phase).toBeNull();
    expect(s.globalPhase).toBe('evaluating');
  });

  it('TEST_DONE on last test sets globalPhase to finalizing', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['only']) });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 1, name: 'only' });
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 'only',
      score: 4,
      stopReason: 'ok',
      elapsedMs: 500,
    });
    expect(s.globalPhase).toBe('finalizing candidate…');
  });

  it('SKIPPED_TEST after an earlier TEST_DONE moves globalPhase to finalizing when nothing left pending', () => {
    let s = reduceRunnerState(createInitialState(), {
      type: 'PREFLIGHT',
      payload: samplePreflight(['good', 'badfile']),
    });
    s = reduceRunnerState(s, { type: 'ITERATION_START', candidateId: 3, iteration: 2, total: 5 });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 2, name: 'good' });
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 'good',
      score: 3,
      stopReason: 'ok',
      elapsedMs: 100,
    });
    expect(s.globalPhase).toBe('evaluating');
    s = reduceRunnerState(s, {
      type: 'SKIPPED_TEST',
      filePath: '/x/meta-harness/test-cases/badfile.json',
      message: 'schema',
    });
    expect(s.globalPhase).toBe('finalizing candidate…');
  });

  it('all SKIPPED_TEST (no TEST_DONE) ends on finalizing when every row is skipped', () => {
    let s = reduceRunnerState(createInitialState(), {
      type: 'PREFLIGHT',
      payload: { ...samplePreflight(['x', 'y']), evalOnly: true },
    });
    s = reduceRunnerState(s, { type: 'ITERATION_START', candidateId: 1, iteration: 1, total: 1 });
    expect(s.globalPhase).toBe('evaluating');
    s = reduceRunnerState(s, {
      type: 'SKIPPED_TEST',
      filePath: '/tc/x.json',
      message: 'bad',
    });
    expect(s.globalPhase).toBe('evaluating');
    s = reduceRunnerState(s, {
      type: 'SKIPPED_TEST',
      filePath: '/tc/y.json',
      message: 'bad',
    });
    expect(s.globalPhase).toBe('finalizing candidate…');
  });

  it('TEST_DONE does not overwrite globalPhase when quit was requested', () => {
    let s = reduceRunnerState(createInitialState(), { type: 'PREFLIGHT', payload: samplePreflight(['t']) });
    s = reduceRunnerState(s, { type: 'ITERATION_START', candidateId: 1, iteration: 1, total: 1 });
    s = reduceRunnerState(s, { type: 'TEST_START', index: 0, total: 1, name: 't' });
    s = reduceRunnerState(s, { type: 'QUIT_REQUESTED' });
    expect(s.globalPhase).toContain('stopping');
    s = reduceRunnerState(s, {
      type: 'TEST_DONE',
      name: 't',
      score: 1,
      stopReason: 'ok',
      elapsedMs: 10,
    });
    expect(s.globalPhase).toContain('stopping');
  });

  it('globalPhaseAfterTestWork stays evaluating while a row is still running', () => {
    const base: Omit<TestRowState, 'name' | 'status'> = {
      score: null,
      stopReason: null,
      liveLine: '',
      phase: null,
      elapsedLabel: '',
      startedAtMs: null,
      lastHeartbeatSec: null,
      detailLines: [],
    };
    expect(
      globalPhaseAfterTestWork([
        { name: 'a', status: 'done', ...base, score: 1, elapsedLabel: '1s' },
        { name: 'b', status: 'running', ...base, startedAtMs: Date.now() },
      ]),
    ).toBe('evaluating');
    expect(
      globalPhaseAfterTestWork([
        { name: 'a', status: 'done', ...base, score: 1, elapsedLabel: '1s' },
        { name: 'b', status: 'done', ...base, score: 2, elapsedLabel: '1s' },
      ]),
    ).toBe('finalizing candidate…');
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
