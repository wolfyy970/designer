/**
 * Headless Chromium evaluation via Playwright: real render + DOM + console/page errors.
 * Complements deterministic preflight in browser-qa-evaluator.ts.
 */
import { chromium, type Page } from 'playwright';
import { bundleVirtualFS } from '../../src/lib/bundle-virtual-fs.ts';
import type { EvaluatorWorkerReport } from '../../src/types/evaluation.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import {
  PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY,
  PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2,
  PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3,
  PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5,
  PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER,
  PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY,
} from './browser-eval-scoring-config.ts';
import {
  PLAYWRIGHT_EVAL_SCRIPT,
  parsePlaywrightDomMetrics,
  scoreBodyLayout,
  scoreVisibleTextLength,
} from './browser-playwright-eval-metrics.ts';

export interface BrowserPlaywrightInput {
  files: Record<string, string>;
  /** When set, load this URL (virtual FS preview) instead of inlined bundled HTML. */
  previewPageUrl?: string;
}

function scorePlaywrightConsoleErrors(errorCount: number): number {
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5) return 5;
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3) return 3;
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2) return 2;
  return Math.max(1, 5 - PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY);
}

const SCREENSHOT_MAX_BASE64 = 600_000;
const FONTS_READY_TIMEOUT_MS = 8_000;
const NETWORK_IDLE_AFTER_SET_CONTENT_MS = 10_000;

function skipReport(
  reason: 'browser_unavailable' | 'eval_error',
  message: string,
): EvaluatorWorkerReport {
  return {
    rubric: 'browser',
    scores: {},
    findings: [],
    hardFails: [],
    playwrightSkipped: { reason, message: message.slice(0, 800) },
  };
}

async function settlePageForEval(page: Page): Promise<void> {
  // String evaluate: runs in the page (has `document`); keeps Node `tsc` happy without DOM lib.
  await page
    .evaluate(
      `(() => Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, ${FONTS_READY_TIMEOUT_MS})),
      ]))()`,
    )
    .catch((err) => {
      console.warn('[playwright-eval] document.fonts.ready', normalizeError(err));
    });

  await page
    .waitForFunction(`() => (document.body?.innerText ?? '').trim().length >= 10`, {
      timeout: 4500,
    })
    .catch((err) => {
      console.warn('[playwright-eval] settlePageForEval: minimal text timeout', normalizeError(err));
    });
  await page.evaluate(`(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }))()`);
}

async function loadPageForScreenshot(page: Page, bundled: string, previewPageUrl?: string): Promise<void> {
  if (previewPageUrl) {
    await page.goto(previewPageUrl, { waitUntil: 'networkidle', timeout: 25_000 });
  } else {
    await page.setContent(bundled, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_AFTER_SET_CONTENT_MS }).catch(() => {});
  }
}

/**
 * Run Playwright against bundled HTML (inlined assets). Returns rubric `browser` slice
 * with `playwright_*` score keys merged upstream with preflight scores.
 */
export async function runBrowserPlaywrightEval(
  input: BrowserPlaywrightInput,
): Promise<EvaluatorWorkerReport> {
  let bundled: string;
  if (input.previewPageUrl) {
    bundled = '<html><body></body></html>';
  } else {
    try {
      bundled = bundleVirtualFS(input.files);
    } catch (err) {
      console.warn(
        '[playwright-eval] bundleVirtualFS failed; using fallback HTML slice',
        normalizeError(err),
      );
      bundled =
        Object.values(input.files).find((v) => /<html/i.test(v)) ?? '<html><body></body></html>';
    }
  }

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    return skipReport('browser_unavailable', `Chromium launch failed: ${normalizeError(err)}`);
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loadPageForScreenshot(page, bundled, input.previewPageUrl);
    await settlePageForEval(page);

    const metrics = parsePlaywrightDomMetrics(await page.evaluate(PLAYWRIGHT_EVAL_SCRIPT));

    let artifacts: EvaluatorWorkerReport['artifacts'];
    try {
      const buf = await page.screenshot({
        type: 'jpeg',
        quality: PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY,
        fullPage: false,
      });
      const base64 = buf.toString('base64');
      if (base64.length <= SCREENSHOT_MAX_BASE64) {
        artifacts = {
          browserScreenshot: { mediaType: 'image/jpeg', base64 },
        };
      }
    } catch {
      // Screenshot is best-effort; metrics still apply
    }

    const scores: EvaluatorWorkerReport['scores'] = {
      playwright_render: {
        score:
          pageErrors.length === 0
            ? 5
            : Math.max(1, 5 - pageErrors.length * PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER),
        notes:
          pageErrors.length === 0
            ? 'Page loaded without uncaught exceptions'
            : pageErrors.slice(0, 2).join('; '),
      },
      playwright_console: {
        score: scorePlaywrightConsoleErrors(consoleErrors.length),
        notes:
          consoleErrors.length === 0
            ? 'No console errors'
            : consoleErrors.slice(0, 3).join('; '),
      },
      playwright_visible_text: {
        score: scoreVisibleTextLength(metrics.textLen),
        notes: `Visible text length ≈ ${metrics.textLen} chars`,
      },
      playwright_layout: {
        score: scoreBodyLayout(metrics.bodyW, metrics.bodyH),
        notes: `Body box ${Math.round(metrics.bodyW)}×${Math.round(metrics.bodyH)}`,
      },
      playwright_images: {
        score:
          metrics.brokenImages === 0
            ? 5
            : Math.max(1, 5 - metrics.brokenImages * PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER),
        notes:
          metrics.brokenImages === 0
            ? 'No broken images detected'
            : `${metrics.brokenImages} image(s) appear broken (0×0)`,
      },
    };

    const findings: EvaluatorWorkerReport['findings'] = [];
    const hardFails: EvaluatorWorkerReport['hardFails'] = [];

    if (pageErrors.length > 0) {
      findings.push({
        severity: 'high',
        summary: 'Uncaught page errors in headless browser',
        detail: pageErrors[0] ?? '',
      });
      hardFails.push({
        code: 'playwright_page_error',
        message: (pageErrors[0] ?? 'page error').slice(0, 400),
      });
    }

    // Hard-fail only when the viewport is effectively blank. Marginal text (slow hydration,
    // loading spinners) is surfaced via playwright_visible_text score + findings instead of
    // forcing an unrecoverable revision loop.
    if (metrics.textLen < 1) {
      hardFails.push({
        code: 'playwright_empty_visible',
        message: 'Rendered page has no visible text',
      });
    } else if (metrics.textLen < 10) {
      findings.push({
        severity: 'medium',
        summary: 'Very little visible text after load',
        detail: `innerText length ≈ ${metrics.textLen} (may be slow hydration or sparse UI)`,
      });
    }

    return { rubric: 'browser', scores, findings, hardFails, artifacts };
  } catch (err) {
    return skipReport('eval_error', normalizeError(err));
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Merge preflight + Playwright browser reports into one `browser` rubric payload. */
export function mergeBrowserEvalReports(
  preflight: EvaluatorWorkerReport,
  playwright: EvaluatorWorkerReport,
): EvaluatorWorkerReport {
  return {
    rubric: 'browser',
    scores: { ...preflight.scores, ...playwright.scores },
    findings: [...preflight.findings, ...playwright.findings],
    hardFails: [...preflight.hardFails, ...playwright.hardFails],
    artifacts: playwright.artifacts ?? preflight.artifacts,
  };
}

/**
 * Merge VM preflight with Playwright. When Playwright was skipped (missing browser / harness error),
 * keep preflight scores and only append a single finding — avoids bogus revision loops from setup gaps.
 */
export function mergePreflightWithPlaywright(
  preflight: EvaluatorWorkerReport,
  playwright: EvaluatorWorkerReport,
): EvaluatorWorkerReport {
  if (playwright.playwrightSkipped) {
    const summary =
      playwright.playwrightSkipped.reason === 'browser_unavailable'
        ? 'Headless browser unavailable — VM preflight only'
        : 'Headless browser eval failed — VM preflight only';
    return {
      ...preflight,
      findings: [
        ...preflight.findings,
        {
          severity: 'medium',
          summary,
          detail: playwright.playwrightSkipped.message,
        },
      ],
    };
  }
  return mergeBrowserEvalReports(preflight, playwright);
}
