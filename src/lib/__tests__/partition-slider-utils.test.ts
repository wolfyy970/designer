import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RUBRIC_WEIGHTS,
  EVALUATOR_RUBRIC_IDS,
} from '../../types/evaluation';
import {
  DEFAULT_PARTITION_MIN_PCT,
  floatWeightsToPercents,
  moveHandleByPercentDelta,
  nudgeHandle,
  percentsToFloatWeights,
  setSegmentPercent,
} from '../partition-slider-utils';

const ORDERED = EVALUATOR_RUBRIC_IDS;

describe('floatWeightsToPercents', () => {
  it('maps default rubric weights to 40, 30, 20, 10', () => {
    expect(floatWeightsToPercents(DEFAULT_RUBRIC_WEIGHTS, ORDERED)).toEqual({
      design: 40,
      strategy: 30,
      implementation: 20,
      browser: 10,
    });
  });

  it('sums to 100 after rounding', () => {
    const w = { design: 0.333, strategy: 0.333, implementation: 0.334, browser: 0 };
    const p = floatWeightsToPercents(w, ORDERED);
    const sum = ORDERED.reduce((s, id) => s + p[id]!, 0);
    expect(sum).toBe(100);
  });
});

describe('percentsToFloatWeights', () => {
  it('divides by 100 for each key in order', () => {
    const p = { design: 40, strategy: 30, implementation: 20, browser: 10 };
    expect(percentsToFloatWeights(p, ORDERED)).toEqual({
      design: 0.4,
      strategy: 0.3,
      implementation: 0.2,
      browser: 0.1,
    });
  });
});

describe('moveHandleByPercentDelta', () => {
  const base = { design: 40, strategy: 30, implementation: 20, browser: 10 };
  const min = DEFAULT_PARTITION_MIN_PCT;

  it('returns null for invalid handle index', () => {
    expect(moveHandleByPercentDelta(ORDERED, base, -1, 5, min)).toBeNull();
    expect(moveHandleByPercentDelta(ORDERED, base, 4, 5, min)).toBeNull();
  });

  it('moves boundary: positive delta shrinks left segment', () => {
    const next = moveHandleByPercentDelta(ORDERED, base, 0, 10, min);
    expect(next).toEqual({
      design: 30,
      strategy: 40,
      implementation: 20,
      browser: 10,
    });
  });

  it('clamps so segments stay at least min', () => {
    const next = moveHandleByPercentDelta(ORDERED, base, 0, 100, min);
    expect(next!.design).toBe(min);
    expect(next!.strategy).toBe(70 - min);
  });
});

describe('nudgeHandle', () => {
  const base = { design: 40, strategy: 30, implementation: 20, browser: 10 };
  const min = DEFAULT_PARTITION_MIN_PCT;

  it('nudges with arrow semantics', () => {
    const left = nudgeHandle(ORDERED, base, 0, 'left', 2, min);
    expect(left!.design).toBe(42);
    expect(left!.strategy).toBe(28);
    const right = nudgeHandle(ORDERED, base, 0, 'right', 2, min);
    expect(right!.design).toBe(38);
    expect(right!.strategy).toBe(32);
  });
});

describe('setSegmentPercent', () => {
  const base = { design: 40, strategy: 30, implementation: 20, browser: 10 };
  const min = DEFAULT_PARTITION_MIN_PCT;

  it('sets one segment and redistributes others', () => {
    const next = setSegmentPercent(ORDERED, base, 0, 50, min);
    expect(next).not.toBeNull();
    expect(next!.design).toBe(50);
    const sum = ORDERED.reduce((s, id) => s + next![id]!, 0);
    expect(sum).toBe(100);
    for (const id of ORDERED) {
      expect(next![id]!).toBeGreaterThanOrEqual(min);
    }
  });

  it('clamps oversized target to leave room for minimums on peers', () => {
    const next = setSegmentPercent(ORDERED, base, 0, 99, min);
    expect(next).not.toBeNull();
    expect(next!.design).toBeLessThanOrEqual(100 - 3 * min);
    const sum = ORDERED.reduce((s, id) => s + next![id]!, 0);
    expect(sum).toBe(100);
    for (const id of ORDERED) expect(next![id]!).toBeGreaterThanOrEqual(min);
  });
});
