import { describe, it, expect } from 'vitest';
import {
  mergeBrowserEvalReports,
  mergePreflightWithPlaywright,
} from '../browser-playwright-evaluator.ts';
import type { EvaluatorWorkerReport } from '../../../src/types/evaluation.ts';

const preflight = (): EvaluatorWorkerReport => ({
  rubric: 'browser',
  scores: { js_runtime: { score: 5, notes: 'ok' } },
  findings: [],
  hardFails: [],
});

describe('mergePreflightWithPlaywright', () => {
  it('keeps preflight only when Playwright was skipped (no extra scores)', () => {
    const merged = mergePreflightWithPlaywright(preflight(), {
      rubric: 'browser',
      scores: { playwright_render: { score: 0, notes: 'would tank avg' } },
      findings: [],
      hardFails: [],
      playwrightSkipped: {
        reason: 'browser_unavailable',
        message: 'Executable not found',
      },
    });
    expect(merged.scores).toEqual(preflight().scores);
    expect(merged.hardFails).toEqual([]);
    expect(merged.findings.some((f) => f.summary.includes('preflight only'))).toBe(true);
  });

  it('merges scores and artifacts when Playwright ran', () => {
    const shot = { mediaType: 'image/jpeg' as const, base64: 'qqq' };
    const merged = mergePreflightWithPlaywright(preflight(), {
      rubric: 'browser',
      scores: { playwright_render: { score: 5, notes: 'ok' } },
      findings: [{ severity: 'low', summary: 'note', detail: 'd' }],
      hardFails: [],
      artifacts: { browserScreenshot: shot },
    });
    expect(merged.scores.playwright_render?.score).toBe(5);
    expect(merged.scores.js_runtime?.score).toBe(5);
    expect(merged.artifacts?.browserScreenshot).toEqual(shot);
    expect(merged.findings.length).toBe(1);
  });
});

describe('mergeBrowserEvalReports', () => {
  it('prefers Playwright artifacts over preflight', () => {
    const a = mergeBrowserEvalReports(
      {
        ...preflight(),
        artifacts: { browserScreenshot: { mediaType: 'image/png', base64: 'old' } },
      },
      {
        rubric: 'browser',
        scores: { x: { score: 4, notes: '' } },
        findings: [],
        hardFails: [],
        artifacts: { browserScreenshot: { mediaType: 'image/jpeg', base64: 'new' } },
      },
    );
    expect(a.artifacts?.browserScreenshot?.base64).toBe('new');
  });
});
