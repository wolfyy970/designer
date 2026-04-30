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
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      iterations: 1,
      proposerModel: 'm',
      proposerMaxToolRounds: 3,
      defaultIncubatorProvider: 'openrouter',
    };
    const args: MetaHarnessCliArgs = {
      mode: 'incubate',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: false,
      promoteOnly: false,
      testFilters: [],
    };

    const candidateDir = path.join(root, 'candidate');
    await mkdir(candidateDir, { recursive: true });

    await runTestCasesEvaluation({
      args,
      cfg,
      candidateId: 1,
      testFiles: [bad, ugly],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 2,
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

  it('skips when name does not match filename basename', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-ceval-name-'));
    const tf = path.join(root, 'correct-name.json');
    await writeFile(
      tf,
      JSON.stringify({
        name: 'wrong',
        spec: {
          title: 'T',
          sections: {
            'design-brief': 'b',
            'research-context': '',
            'objectives-metrics': '',
            'design-constraints': '',
          },
        },
        model: { providerId: 'openrouter', modelId: 'x/y' },
      }),
      'utf8',
    );

    const skipped: Array<{ path: string; msg: string }> = [];
    const cfg: MetaHarnessConfig = {
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      iterations: 1,
      proposerModel: 'm',
      proposerMaxToolRounds: 3,
      defaultIncubatorProvider: 'openrouter',
    };
    const args: MetaHarnessCliArgs = {
      mode: 'incubate',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: false,
      promoteOnly: false,
      testFilters: [],
    };

    const candidateDir = path.join(root, 'candidate');
    await mkdir(candidateDir, { recursive: true });

    await runTestCasesEvaluation({
      args,
      cfg,
      candidateId: 1,
      testFiles: [tf],
      evalRunsBase: path.join(root, 'eval-runs'),
      incubateProvider: 'openrouter',
      incubateModel: 'm',
      hypothesisEvalModel: 'm',
      inputsRubricModel: 'm',
      incubateHypothesisCountDefault: 2,
      apiKey: '',
      candidateDir,
      callbacks: {
        onSkippedTestCase(filePath: string, message: string) {
          skipped.push({ path: filePath, msg: message });
        },
      } as unknown as RunnerCallbacks,
    });

    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.path).toBe(tf);
    expect(skipped[0]!.msg).toContain('name field must match');
  });
});
