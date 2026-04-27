import { describe, it, expect } from 'vitest';
import {
  TRANSIENT_RESULT_FIELDS,
  clearTransientResultFields,
  closeOpenThinkingTurns,
} from '../placeholder-session-state';
import type { GenerationResult } from '../../types/provider';

describe('placeholder-session-state transient registry', () => {
  it('clearTransientResultFields clears exactly TRANSIENT_RESULT_FIELDS keys', () => {
    const cleared = clearTransientResultFields();
    expect(Object.keys(cleared).sort()).toEqual([...TRANSIENT_RESULT_FIELDS].sort());
    for (const key of TRANSIENT_RESULT_FIELDS) {
      expect(cleared[key as keyof GenerationResult]).toBeUndefined();
    }
  });
});

describe('closeOpenThinkingTurns', () => {
  it('returns false and no-ops when no turns are open', () => {
    const state = {
      thinkingTurns: [{ turnId: 1, text: 'done', startedAt: 1, endedAt: 2 }],
    };
    const snapshotBefore = state.thinkingTurns;
    expect(closeOpenThinkingTurns(state)).toBe(false);
    expect(state.thinkingTurns).toBe(snapshotBefore);
  });

  it('closes every open turn and returns true', () => {
    const state = {
      thinkingTurns: [
        { turnId: 1, text: 'a', startedAt: 10, endedAt: 20 },
        { turnId: 2, text: 'b', startedAt: 30 },
        { turnId: 3, text: 'c', startedAt: 40 },
      ],
    };
    expect(closeOpenThinkingTurns(state)).toBe(true);
    expect(state.thinkingTurns.every((t) => t.endedAt != null)).toBe(true);
    expect(state.thinkingTurns[0]?.endedAt).toBe(20);
  });

  it('is idempotent: a second call after all turns are closed returns false', () => {
    const state = {
      thinkingTurns: [{ turnId: 1, text: 'a', startedAt: 10 }],
    };
    expect(closeOpenThinkingTurns(state)).toBe(true);
    expect(closeOpenThinkingTurns(state)).toBe(false);
  });
});
