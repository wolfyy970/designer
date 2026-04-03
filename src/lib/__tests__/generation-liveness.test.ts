import { describe, it, expect } from 'vitest';
import { lastDefinedMax, modelQuietSeconds } from '../generation-liveness';

describe('lastDefinedMax', () => {
  it('returns max when both defined', () => {
    expect(lastDefinedMax(100, 200)).toBe(200);
    expect(lastDefinedMax(300, 200)).toBe(300);
  });

  it('returns the single defined value', () => {
    expect(lastDefinedMax(42, undefined)).toBe(42);
    expect(lastDefinedMax(undefined, 99)).toBe(99);
  });

  it('returns undefined when neither defined', () => {
    expect(lastDefinedMax(undefined, undefined)).toBeUndefined();
  });
});

describe('modelQuietSeconds', () => {
  it('returns undefined when both timestamps missing', () => {
    expect(modelQuietSeconds(1_000, undefined, undefined)).toBeUndefined();
  });

  it('uses the later of activity and trace', () => {
    const now = 10_000;
    expect(modelQuietSeconds(now, 7_000, 8_000)).toBe(2);
    expect(modelQuietSeconds(now, 9_000, 5_000)).toBe(1);
  });

  it('never returns negative', () => {
    expect(modelQuietSeconds(1_000, 2_000, undefined)).toBe(0);
  });
});
