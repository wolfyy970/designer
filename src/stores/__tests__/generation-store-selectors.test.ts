import { describe, it, expect } from 'vitest';
import {
  getStack,
  getActiveResult,
  getBestCompleteResult,
  getScopedStack,
  getScopedActiveResult,
  nextRunNumber,
  type GenerationState,
} from '../generation-store';
import type { GenerationResult } from '../../types/provider';

function makeResult(
  overrides: Partial<GenerationResult> & { id: string },
): GenerationResult {
  return {
    variantStrategyId: 'vs-1',
    providerId: 'openrouter',
    status: 'complete',
    runId: 'run-1',
    runNumber: 1,
    metadata: { model: 'test-model' },
    ...overrides,
  };
}

function mockState(
  results: GenerationResult[],
  selectedVersions: Record<string, string> = {},
  userBestOverrides: Record<string, string> = {},
): GenerationState {
  return { results, selectedVersions, userBestOverrides };
}

// ─── getStack ────────────────────────────────────────────────────────

describe('getStack', () => {
  it('returns results for a hypothesis sorted newest-first', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 1 }),
      makeResult({ id: 'r2', runNumber: 3 }),
      makeResult({ id: 'r3', variantStrategyId: 'vs-2', runNumber: 1 }),
      makeResult({ id: 'r4', runNumber: 2 }),
    ]);

    const stack = getStack(state, 'vs-1');
    expect(stack).toHaveLength(3);
    expect(stack.map((r) => r.id)).toEqual(['r2', 'r4', 'r1']);
  });

  it('returns empty array for unknown hypothesis', () => {
    const state = mockState([makeResult({ id: 'r1' })]);
    expect(getStack(state, 'vs-unknown')).toEqual([]);
  });

  it('handles single result', () => {
    const state = mockState([makeResult({ id: 'r1' })]);
    const stack = getStack(state, 'vs-1');
    expect(stack).toHaveLength(1);
    expect(stack[0].id).toBe('r1');
  });

  it('handles empty results', () => {
    const state = mockState([]);
    expect(getStack(state, 'vs-1')).toEqual([]);
  });
});

// ─── getActiveResult ─────────────────────────────────────────────────

describe('getActiveResult', () => {
  it('returns selected version when present', () => {
    const state = mockState(
      [
        makeResult({ id: 'r1', runNumber: 1 }),
        makeResult({ id: 'r2', runNumber: 2 }),
      ],
      { 'vs-1': 'r1' },
    );
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r1');
  });

  it('prefers generating over stale selection so the new run is visible', () => {
    const state = mockState(
      [
        makeResult({ id: 'r1', runNumber: 1 }),
        makeResult({ id: 'r2', runNumber: 2, status: 'generating' }),
      ],
      { 'vs-1': 'r1' },
    );
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r2');
  });

  it('prioritizes generating over complete when no selection', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 1 }),
      makeResult({ id: 'r2', runNumber: 2, status: 'generating' }),
      makeResult({ id: 'r3', runNumber: 3 }),
    ]);
    // r2 is generating — takes priority so user sees active generation
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r2');
  });

  it('falls back to generating when no complete results', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 1, status: 'error' }),
      makeResult({ id: 'r2', runNumber: 2, status: 'generating' }),
    ]);
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r2');
  });

  it('prefers highest evaluated complete when no selection or generating', () => {
    const state = mockState([
      makeResult({
        id: 'r1',
        runNumber: 1,
        evaluationSummary: {
          overallScore: 4.8,
          normalizedScores: {},
          hardFails: [],
          prioritizedFixes: [],
          shouldRevise: false,
          revisionBrief: '',
        },
      }),
      makeResult({
        id: 'r2',
        runNumber: 3,
        evaluationSummary: {
          overallScore: 4.2,
          normalizedScores: {},
          hardFails: [],
          prioritizedFixes: [],
          shouldRevise: false,
          revisionBrief: '',
        },
      }),
    ]);
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r1');
  });

  it('falls back to first in stack when no complete or generating', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 1, status: 'error' }),
      makeResult({ id: 'r2', runNumber: 2, status: 'error' }),
    ]);
    // Stack is sorted newest-first, so r2 is first
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r2');
  });

  it('returns undefined for unknown hypothesis', () => {
    const state = mockState([makeResult({ id: 'r1' })]);
    expect(getActiveResult(state, 'vs-unknown')).toBeUndefined();
  });

  it('ignores invalid selectedVersion reference', () => {
    const state = mockState(
      [makeResult({ id: 'r1', runNumber: 1 })],
      { 'vs-1': 'nonexistent' },
    );
    // Falls back to latest complete
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r1');
  });

  it('returns undefined for empty results', () => {
    const state = mockState([]);
    expect(getActiveResult(state, 'vs-1')).toBeUndefined();
  });
});

describe('getBestCompleteResult', () => {
  it('returns newest complete when nothing has evaluation', () => {
    const out = getBestCompleteResult([
      makeResult({ id: 'r1', runNumber: 1 }),
      makeResult({ id: 'r2', runNumber: 3 }),
    ]);
    expect(out?.id).toBe('r2');
  });

  it('breaks score ties by newer run', () => {
    const summary = {
      overallScore: 4.5,
      normalizedScores: {},
      hardFails: [],
      prioritizedFixes: [],
      shouldRevise: false,
      revisionBrief: '',
    };
    const out = getBestCompleteResult([
      makeResult({ id: 'r1', runNumber: 1, evaluationSummary: summary }),
      makeResult({ id: 'r2', runNumber: 2, evaluationSummary: summary }),
    ]);
    expect(out?.id).toBe('r2');
  });

  it('honors userBestOverrides over evaluator score', () => {
    const low = {
      overallScore: 3.0,
      normalizedScores: {},
      hardFails: [],
      prioritizedFixes: [],
      shouldRevise: false,
      revisionBrief: '',
    };
    const high = {
      overallScore: 5.0,
      normalizedScores: {},
      hardFails: [],
      prioritizedFixes: [],
      shouldRevise: false,
      revisionBrief: '',
    };
    const out = getBestCompleteResult(
      [
        makeResult({ id: 'r1', runNumber: 1, evaluationSummary: low }),
        makeResult({ id: 'r2', runNumber: 2, evaluationSummary: high }),
      ],
      { variantStrategyId: 'vs-1', userBestOverrides: { 'vs-1': 'r1' } },
    );
    expect(out?.id).toBe('r1');
  });

  it('ignores userBestOverrides when result id missing from stack', () => {
    const summary = {
      overallScore: 5.0,
      normalizedScores: {},
      hardFails: [],
      prioritizedFixes: [],
      shouldRevise: false,
      revisionBrief: '',
    };
    const out = getBestCompleteResult(
      [makeResult({ id: 'r1', runNumber: 1, evaluationSummary: summary })],
      { variantStrategyId: 'vs-1', userBestOverrides: { 'vs-1': 'ghost' } },
    );
    expect(out?.id).toBe('r1');
  });
});

describe('getActiveResult user best override', () => {
  it('uses user override when no explicit selection', () => {
    const summary = (score: number) => ({
      overallScore: score,
      normalizedScores: {},
      hardFails: [],
      prioritizedFixes: [],
      shouldRevise: false,
      revisionBrief: '',
    });
    const state = mockState(
      [
        makeResult({ id: 'r1', runNumber: 1, evaluationSummary: summary(4.0) }),
        makeResult({ id: 'r2', runNumber: 2, evaluationSummary: summary(5.0) }),
      ],
      {},
      { 'vs-1': 'r1' },
    );
    expect(getActiveResult(state, 'vs-1')?.id).toBe('r1');
  });
});

// ─── getScopedStack ─────────────────────────────────────────────────

describe('getScopedStack', () => {
  it('filters by both variantStrategyId and runId', () => {
    const state = mockState([
      makeResult({ id: 'r1', runId: 'run-1', runNumber: 1 }),
      makeResult({ id: 'r2', runId: 'run-2', runNumber: 2 }),
      makeResult({ id: 'r3', runId: 'run-1', runNumber: 3 }),
      makeResult({ id: 'r4', variantStrategyId: 'vs-2', runId: 'run-1', runNumber: 1 }),
    ]);
    const stack = getScopedStack(state, 'vs-1', 'run-1');
    expect(stack).toHaveLength(2);
    expect(stack.map((r) => r.id)).toEqual(['r3', 'r1']);
  });

  it('returns empty for non-existent run', () => {
    const state = mockState([makeResult({ id: 'r1', runId: 'run-1' })]);
    expect(getScopedStack(state, 'vs-1', 'run-999')).toEqual([]);
  });

  it('returns empty for non-existent strategy', () => {
    const state = mockState([makeResult({ id: 'r1', runId: 'run-1' })]);
    expect(getScopedStack(state, 'vs-unknown', 'run-1')).toEqual([]);
  });
});

// ─── getScopedActiveResult ──────────────────────────────────────────

describe('getScopedActiveResult', () => {
  it('returns selected version from scoped key', () => {
    const state = mockState(
      [
        makeResult({ id: 'r1', runId: 'run-1', runNumber: 1 }),
        makeResult({ id: 'r2', runId: 'run-1', runNumber: 2 }),
      ],
      { 'vs-1:run-1': 'r1' },
    );
    expect(getScopedActiveResult(state, 'vs-1', 'run-1')?.id).toBe('r1');
  });

  it('prefers generating in scope over stale scoped selection', () => {
    const state = mockState(
      [
        makeResult({ id: 'r1', runId: 'run-1', runNumber: 1 }),
        makeResult({ id: 'r2', runId: 'run-1', runNumber: 2, status: 'generating' }),
      ],
      { 'vs-1:run-1': 'r1' },
    );
    expect(getScopedActiveResult(state, 'vs-1', 'run-1')?.id).toBe('r2');
  });

  it('falls back to best evaluated complete in run', () => {
    const state = mockState([
      makeResult({
        id: 'r1',
        runId: 'run-1',
        runNumber: 1,
        evaluationSummary: {
          overallScore: 4.9,
          normalizedScores: {},
          hardFails: [],
          prioritizedFixes: [],
          shouldRevise: false,
          revisionBrief: '',
        },
      }),
      makeResult({
        id: 'r2',
        runId: 'run-1',
        runNumber: 2,
        evaluationSummary: {
          overallScore: 4.1,
          normalizedScores: {},
          hardFails: [],
          prioritizedFixes: [],
          shouldRevise: false,
          revisionBrief: '',
        },
      }),
    ]);
    expect(getScopedActiveResult(state, 'vs-1', 'run-1')?.id).toBe('r1');
  });

  it('returns undefined when run has no results', () => {
    const state = mockState([makeResult({ id: 'r1', runId: 'run-1' })]);
    expect(getScopedActiveResult(state, 'vs-1', 'run-other')).toBeUndefined();
  });

  it('ignores selections from other scopes', () => {
    const state = mockState(
      [
        makeResult({ id: 'r1', runId: 'run-1', runNumber: 1 }),
        makeResult({ id: 'r2', runId: 'run-2', runNumber: 2 }),
      ],
      { 'vs-1': 'r2' }, // unscoped selection should not match scoped lookup
    );
    // Should fall back to latest complete in run-1 (r1), not use the unscoped selection
    expect(getScopedActiveResult(state, 'vs-1', 'run-1')?.id).toBe('r1');
  });
});

// ─── nextRunNumber ───────────────────────────────────────────────────

describe('nextRunNumber', () => {
  it('returns 1 for first run', () => {
    const state = mockState([]);
    expect(nextRunNumber(state, 'vs-1')).toBe(1);
  });

  it('increments from max run number', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 3 }),
      makeResult({ id: 'r2', runNumber: 1 }),
    ]);
    expect(nextRunNumber(state, 'vs-1')).toBe(4);
  });

  it('ignores other hypotheses', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 1 }),
      makeResult({ id: 'r2', variantStrategyId: 'vs-2', runNumber: 10 }),
    ]);
    expect(nextRunNumber(state, 'vs-1')).toBe(2);
  });

  it('handles gaps in run numbers', () => {
    const state = mockState([
      makeResult({ id: 'r1', runNumber: 1 }),
      makeResult({ id: 'r2', runNumber: 5 }),
    ]);
    expect(nextRunNumber(state, 'vs-1')).toBe(6);
  });
});
