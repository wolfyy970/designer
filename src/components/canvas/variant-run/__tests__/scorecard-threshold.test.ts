import { describe, it, expect } from 'vitest';
import {
  SCORECARD_PASS_THRESHOLD,
  scoreToBarPercent,
  thresholdTone,
} from '../scorecard-threshold';

describe('thresholdTone', () => {
  it('returns success at or above the default threshold (3.8)', () => {
    expect(thresholdTone(3.8)).toBe('success');
    expect(thresholdTone(4.1)).toBe('success');
    expect(thresholdTone(5)).toBe('success');
  });

  it('returns warning below the threshold', () => {
    expect(thresholdTone(3.7)).toBe('warning');
    expect(thresholdTone(2)).toBe('warning');
    expect(thresholdTone(0)).toBe('warning');
  });

  it('respects an override threshold', () => {
    expect(thresholdTone(3.8, 4)).toBe('warning');
    expect(thresholdTone(4, 4)).toBe('success');
  });

  it('exposes the default threshold as a constant', () => {
    expect(SCORECARD_PASS_THRESHOLD).toBe(3.8);
  });
});

describe('scoreToBarPercent', () => {
  it('maps 0 → 0% and EVALUATOR_MAX_SCORE (5) → 100%', () => {
    expect(scoreToBarPercent(0)).toBe(0);
    expect(scoreToBarPercent(5)).toBe(100);
    expect(scoreToBarPercent(2.5)).toBe(50);
  });

  it('clamps out-of-range values', () => {
    expect(scoreToBarPercent(-1)).toBe(0);
    expect(scoreToBarPercent(99)).toBe(100);
  });

  it('treats non-finite inputs as 0', () => {
    expect(scoreToBarPercent(Number.NaN)).toBe(0);
    expect(scoreToBarPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
