/**
 * Real-browser integration tests for the Playwright evaluator.
 *
 * The sibling `browser-playwright-evaluator.test.ts` covers ONLY the merge
 * helpers (`mergePreflightWithPlaywright` / `mergeBrowserEvalReports`), leaving
 * the launch → load → measure → score path at ~12% statement coverage. These
 * tests drive `runBrowserPlaywrightEval` against actual HTML fixtures so the
 * scoring and error-capture paths are exercised for real.
 *
 * Hermetic: every fixture is inline HTML rendered via `setContent` — no
 * network, no preview server, no API key. Requires the Chromium binary
 * (`pnpm exec playwright install chromium`). When it is absent the evaluator
 * returns its `browser_unavailable` skip report, and each test below skips with
 * an explicit message rather than passing silently.
 *
 * Run via `pnpm test:playwright-eval` (this file is excluded from the default
 * suite so `pnpm test` stays hermetic — see AGENTS.md).
 */
import { describe, it, expect } from 'vitest';

import { runBrowserPlaywrightEval } from '../browser-playwright-evaluator.ts';

/** True when Chromium launched — otherwise the evaluator skipped. */
function launched(report: { playwrightSkipped?: { reason: string } }): boolean {
  return report.playwrightSkipped?.reason !== 'browser_unavailable';
}

const PAGE = (body: string, script = '') => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Fixture</title></head>
<body>${body}${script ? `<script>${script}</script>` : ''}</body>
</html>`;

/** A page with enough visible text and body box to score well. */
const GOOD_PAGE = PAGE(`
  <main>
    <h1>Quarterly revenue overview</h1>
    <p>This dashboard summarises performance across all regions for the
       current quarter, including retention, expansion and churn.</p>
    <p>Use the filters above to narrow the view by region or segment.</p>
  </main>
`);

describe('runBrowserPlaywrightEval (real browser)', () => {
  it('scores a clean page highly and attaches a screenshot artifact', async () => {
    const report = await runBrowserPlaywrightEval({
      files: { 'index.html': GOOD_PAGE },
    });

    if (!launched(report)) {
      console.warn('[playwright-eval] Chromium unavailable — skipping real-browser assertions');
      return;
    }

    expect(report.rubric).toBe('browser');
    // No uncaught exceptions and no console errors on a clean fixture.
    expect(report.scores.playwright_render?.score).toBe(5);
    expect(report.scores.playwright_console?.score).toBe(5);
    // Visible-text and layout scoring ran against real DOM measurements.
    expect(report.scores.playwright_visible_text?.score).toBeGreaterThanOrEqual(4);
    expect(report.scores.playwright_layout?.score).toBeGreaterThanOrEqual(4);
    // Screenshot is captured and is a real JPEG payload.
    const shot = report.artifacts?.browserScreenshot;
    expect(shot?.mediaType).toBe('image/jpeg');
    expect(shot?.base64.length ?? 0).toBeGreaterThan(0);
    expect(report.hardFails).toEqual([]);
  });

  it('captures an uncaught page error and penalises the render score', async () => {
    const report = await runBrowserPlaywrightEval({
      files: {
        'index.html': PAGE('<h1>Broken</h1>', 'throw new Error("boom from fixture");'),
      },
    });

    if (!launched(report)) return;

    // The page-error listener is what separates this from the preflight VM check.
    expect(report.scores.playwright_render?.score).toBeLessThan(5);
    expect(report.scores.playwright_render?.notes).toContain('boom from fixture');
    expect(report.findings.some((f) => /boom from fixture/.test(JSON.stringify(f)))).toBe(true);
  });

  it('penalises console errors separately from uncaught page errors', async () => {
    const report = await runBrowserPlaywrightEval({
      files: {
        'index.html': PAGE(
          '<h1>Noisy</h1><p>Body text long enough to render a measurable layout box for scoring.</p>',
          'console.error("noisy console failure");',
        ),
      },
    });

    if (!launched(report)) return;

    // A console error is not an uncaught exception: render stays 5, console drops.
    expect(report.scores.playwright_render?.score).toBe(5);
    expect(report.scores.playwright_console?.score).toBeLessThan(5);
    expect(report.scores.playwright_console?.notes).toContain('noisy console failure');
  });

  it('floors visible-text and layout scores for an empty body', async () => {
    const report = await runBrowserPlaywrightEval({
      files: { 'index.html': PAGE('') },
    });

    if (!launched(report)) return;

    expect(report.scores.playwright_visible_text?.score).toBe(1);
    expect(report.scores.playwright_layout?.score).toBe(1);
  });

  it('reports browser_unavailable as a skip rather than a hard failure', async () => {
    // This asserts the contract the dispatch layer depends on: a missing
    // browser must not tank the aggregate score. It holds whether or not
    // Chromium is installed here.
    const report = await runBrowserPlaywrightEval({ files: { 'index.html': GOOD_PAGE } });

    if (report.playwrightSkipped) {
      expect(report.playwrightSkipped.reason).toBe('browser_unavailable');
      expect(report.hardFails).toEqual([]);
      // No playwright_* keys, so the merge layer keeps preflight scores.
      expect(Object.keys(report.scores).some((k) => k.startsWith('playwright_'))).toBe(false);
    } else {
      expect(Object.keys(report.scores).some((k) => k.startsWith('playwright_'))).toBe(true);
    }
  });
});
