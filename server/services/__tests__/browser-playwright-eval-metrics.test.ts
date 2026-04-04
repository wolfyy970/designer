import { describe, it, expect } from 'vitest';
import {
  parsePlaywrightDomMetrics,
  scoreBodyLayout,
  scoreVisibleTextLength,
} from '../browser-playwright-eval-metrics.ts';

describe('browser-playwright-eval-metrics', () => {
  it('parsePlaywrightDomMetrics accepts valid evaluate output', () => {
    expect(parsePlaywrightDomMetrics({ textLen: 50, bodyW: 200, bodyH: 80, brokenImages: 0 })).toEqual({
      textLen: 50,
      bodyW: 200,
      bodyH: 80,
      brokenImages: 0,
    });
  });

  it('parsePlaywrightDomMetrics falls back on bad shapes', () => {
    expect(parsePlaywrightDomMetrics({ textLen: 'nope' })).toEqual({
      textLen: 0,
      bodyW: 0,
      bodyH: 0,
      brokenImages: 0,
    });
  });

  it('scoreVisibleTextLength matches thresholds', () => {
    expect(scoreVisibleTextLength(100)).toBe(5);
    expect(scoreVisibleTextLength(40)).toBe(3);
    expect(scoreVisibleTextLength(15)).toBe(2);
    expect(scoreVisibleTextLength(3)).toBe(1);
  });

  it('scoreBodyLayout matches thresholds', () => {
    expect(scoreBodyLayout(200, 100)).toBe(5);
    expect(scoreBodyLayout(10, 10)).toBe(3);
    expect(scoreBodyLayout(0, 0)).toBe(1);
  });
});
