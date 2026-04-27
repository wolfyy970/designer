/**
 * Live end-to-end integration: drives the meta-harness evaluator against a running
 * local API. Opt in with RUN_META_HARNESS_LIVE_TESTS=1 (legacy:
 * META_HARNESS_LIVE=1); requires a dev server on `127.0.0.1:4731`
 * and `OPENROUTER_API_KEY` in `.env.local`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runHypothesisEvalFromMetaHarness } from '../evaluator.ts';
import { resolveEvalRunsBaseDir } from '../paths.ts';
import { hydrateMetaHarnessTestCase } from '../test-case-hydrator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const live =
  process.env.RUN_META_HARNESS_LIVE_TESTS === '1' || process.env.META_HARNESS_LIVE === '1';
const describeLive = live ? describe : describe.skip;

describeLive('meta-harness live API', () => {
  it('health responds', async () => {
    const r = await fetch('http://127.0.0.1:4731/api/health');
    expect(r.ok).toBe(true);
  });

  it('runs one agentic hypothesis generate and finds eval-run log dir', async () => {
    const raw = JSON.parse(
      await readFile(path.join(__dirname, '../test-cases/onboarding-checklist.json'), 'utf8'),
    ) as unknown;
    const body = hydrateMetaHarnessTestCase(raw, {
      defaultIncubatorProvider: 'openrouter',
      correlationId: `mh-live-${Date.now()}`,
      agenticMaxRevisionRounds: 1,
    });
    const evalBase = resolveEvalRunsBaseDir('');
    const result = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body,
      evalRunsBaseDir: evalBase,
      evalLogWaitMs: 600_000,
    });
    expect(result.errorMessage, `SSE or HTTP error: ${result.sseErrors.join('; ')}`).toBeUndefined();
    expect(result.evalRunDir, 'eval-run directory should exist after async log write').toBeTruthy();
    const metaPath = path.join(result.evalRunDir!, 'meta.json');
    const metaRaw = await readFile(metaPath, 'utf8');
    const meta = JSON.parse(metaRaw) as { finalOverallScore?: number };
    expect(typeof meta.finalOverallScore).toBe('number');
  }, 600_000);
});
