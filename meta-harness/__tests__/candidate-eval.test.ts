import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTestCasesEvaluation } from '../candidate-eval.ts';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';

describe('runTestCasesEvaluation JSON guard', () => {
  it('skips invalid JSON via onSkippedTestCase and continues', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-ceval-'));
    const bad = path.join(root, 'bad.json');
    const ugly = path.join(root, 'ugly.json');
    await writeFile(bad, 'NOT JSON {{{', 'utf8');
    await writeFile(ugly, '{ "name": 1 }', 'utf8');

    const skipped: Array<{ path: string; msg: string }> = [];
    const cfg: MetaHarnessConfig = {
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      iterations: 1,
      proposerModel: 'm',
      proposerMaxToolRounds: 3,
      defaultCompilerProvider: 'openrouter',
    };
    const args: MetaHarnessCliArgs = {
      mode: 'compile',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      testFilters: [],
    };

    const candidateDir = path.join(root, 'candidate');
    await mkdir(candidateDir, { recursive: true });

    await runTestCasesEvaluation({
      args,
      cfg,
      candidateId: 1,
      promptOverrides: {},
      testFiles: [bad, ugly],
      evalRunsBase: path.join(root, 'eval-runs'),
      compileProvider: 'openrouter',
      compileModel: 'm',
      hypothesisEvalModel: 'm',
      compileHypothesisCountDefault: 2,
      apiKey: '',
      candidateDir,
      callbacks: {
        onSkippedTestCase(filePath: string, message: string) {
          skipped.push({ path: filePath, msg: message });
        },
      } as unknown as RunnerCallbacks,
    });

    expect(skipped.length).toBe(2);
    expect(skipped.some((s) => s.path === bad)).toBe(true);
    expect(skipped.some((s) => s.path === ugly)).toBe(true);
  });
});
