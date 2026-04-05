/**
 * Set META_HARNESS_LIVE=1 with API on 127.0.0.1:3001 and OPENROUTER_API_KEY for real HTTP.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runHypothesisEvalFromMetaHarness } from '../evaluator.ts';
import { resolveEvalRunsBaseDir } from '../paths.ts';
import { hydrateMetaHarnessTestCase } from '../test-case-hydrator.ts';

const live = process.env.META_HARNESS_LIVE === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe.skipIf(!live)('meta-harness live API (META_HARNESS_LIVE=1)', () => {
  it('health responds', async () => {
    const r = await fetch('http://127.0.0.1:3001/api/health');
    expect(r.ok).toBe(true);
  });

  it('runs one agentic hypothesis generate and finds eval-run log dir', async () => {
    const raw = JSON.parse(
      await readFile(path.join(__dirname, '../test-cases/onboarding-checklist.json'), 'utf8'),
    ) as unknown;
    const body = hydrateMetaHarnessTestCase(raw, {
      defaultCompilerProvider: 'openrouter',
      correlationId: `mh-live-${Date.now()}`,
      agenticMaxRevisionRounds: 1,
    });
    const evalBase = resolveEvalRunsBaseDir('');
    const result = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:3001/api',
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
