/**
 * Headless Chromium evaluation via Playwright: real render + DOM + console/page errors.
 * Complements deterministic preflight in browser-qa-evaluator.ts.
 */
import { chromium, type Page } from 'playwright';
import { bundleVirtualFS } from '../../src/lib/bundle-virtual-fs.ts';
import type { EvaluatorWorkerReport } from '../../src/types/evaluation.ts';

export interface BrowserPlaywrightInput {
  files: Record<string, string>;
}

function scoreFromCount(errors: number, maxPenalty = 4): number {
  if (errors === 0) return 5;
  if (errors === 1) return 3;
  if (errors === 2) return 2;
  return Math.max(1, 5 - maxPenalty);
}

const SCREENSHOT_MAX_BASE64 = 600_000;

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
  await page.waitForFunction(
    `() => (document.body?.innerText ?? '').trim().length >= 10`,
    { timeout: 4500 },
  ).catch(() => {});
  await page.evaluate(`(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }))()`);
}

/**
 * Run Playwright against bundled HTML (inlined assets). Returns rubric `browser` slice
 * with `playwright_*` score keys merged upstream with preflight scores.
 */
export async function runBrowserPlaywrightEval(
  input: BrowserPlaywrightInput,
): Promise<EvaluatorWorkerReport> {
  let bundled: string;
  try {
    bundled = bundleVirtualFS(input.files);
  } catch {
    bundled = Object.values(input.files).find((v) => /<html/i.test(v)) ?? '<html><body></body></html>';
  }

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return skipReport('browser_unavailable', `Chromium launch failed: ${msg}`);
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.setContent(bundled, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await settlePageForEval(page);

    const metrics = (await page.evaluate(`(() => {
      const body = document.body;
      const text = (body?.innerText ?? '').trim();
      const rect = body?.getBoundingClientRect();
      const imgs = Array.from(document.images);
      const broken = imgs.filter((i) => i.naturalWidth === 0 && i.naturalHeight === 0).length;
      return {
        textLen: text.length,
        bodyW: rect ? rect.width : 0,
        bodyH: rect ? rect.height : 0,
        brokenImages: broken,
      };
    })()`)) as {
      textLen: number;
      bodyW: number;
      bodyH: number;
      brokenImages: number;
    };

    let artifacts: EvaluatorWorkerReport['artifacts'];
    try {
      const buf = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: false });
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
        score: pageErrors.length === 0 ? 5 : Math.max(1, 5 - pageErrors.length * 2),
        notes:
          pageErrors.length === 0
            ? 'Page loaded without uncaught exceptions'
            : pageErrors.slice(0, 2).join('; '),
      },
      playwright_console: {
        score: scoreFromCount(consoleErrors.length),
        notes:
          consoleErrors.length === 0
            ? 'No console errors'
            : consoleErrors.slice(0, 3).join('; '),
      },
      playwright_visible_text: {
        score:
          metrics.textLen >= 80
            ? 5
            : metrics.textLen >= 30
              ? 3
              : metrics.textLen >= 10
                ? 2
                : 1,
        notes: `Visible text length ≈ ${metrics.textLen} chars`,
      },
      playwright_layout: {
        score:
          metrics.bodyW > 100 && metrics.bodyH > 40
            ? 5
            : metrics.bodyW > 0 && metrics.bodyH > 0
              ? 3
              : 1,
        notes: `Body box ${Math.round(metrics.bodyW)}×${Math.round(metrics.bodyH)}`,
      },
      playwright_images: {
        score: metrics.brokenImages === 0 ? 5 : Math.max(1, 5 - metrics.brokenImages * 2),
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

    if (metrics.textLen < 10) {
      hardFails.push({
        code: 'playwright_empty_visible',
        message: 'Rendered page has almost no visible text',
      });
    }

    return { rubric: 'browser', scores, findings, hardFails, artifacts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return skipReport('eval_error', msg);
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
