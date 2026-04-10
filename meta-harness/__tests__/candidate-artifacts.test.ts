import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeCandidateChangelogAndAggregate, validateTestCaseShapeForMode } from '../candidate-artifacts.ts';
import { ARTIFACT } from '../constants.ts';
import type { MetaHarnessCliArgs } from '../config.ts';

const tmpRoot = path.join(import.meta.dirname, '.tmp-candidate-artifacts');

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

const baseArgs: MetaHarnessCliArgs = {
  mode: 'design',
  once: false,
  evalOnly: false,
  dryRun: false,
  plain: false,
  skipPromotionCheck: false,
  promoteOnly: false,
  testFilters: [],
};

describe('validateTestCaseShapeForMode', () => {
  it('requires strategy in design mode', () => {
    const msg = validateTestCaseShapeForMode(
      'design',
      {
        name: 't',
        spec: { title: 'x', sections: {} },
        model: { providerId: 'p', modelId: 'm' },
      },
      '/x/t.json',
    );
    expect(msg).toContain('strategy');
  });

  it('allows incubate mode without strategy', () => {
    expect(
      validateTestCaseShapeForMode(
        'incubate',
        {
          name: 't',
          spec: { title: 'x', sections: {} },
          model: { providerId: 'p', modelId: 'm' },
        },
        '/x/t.json',
      ),
    ).toBeNull();
  });

  it('allows e2e mode without strategy (incubate picks hypothesis before generate)', () => {
    expect(
      validateTestCaseShapeForMode(
        'e2e',
        {
          name: 't',
          spec: { title: 'x', sections: {} },
          model: { providerId: 'p', modelId: 'm' },
        },
        '/x/t.json',
      ),
    ).toBeNull();
  });

  it('allows inputs mode without strategy when brief exists', () => {
    expect(
      validateTestCaseShapeForMode(
        'inputs',
        {
          name: 't',
          spec: { title: 'x', sections: { 'design-brief': 'Build something' } },
          model: { providerId: 'p', modelId: 'm' },
        },
        '/x/t.json',
      ),
    ).toBeNull();
  });

  it('rejects inputs mode when design-brief is empty', () => {
    const msg = validateTestCaseShapeForMode(
      'inputs',
      {
        name: 't',
        spec: { title: 'x', sections: { 'design-brief': '  ' } },
        model: { providerId: 'p', modelId: 'm' },
      },
      '/x/t.json',
    );
    expect(msg).toContain('design-brief');
  });

  it('rejects inputs mode when design-brief is missing', () => {
    const msg = validateTestCaseShapeForMode(
      'inputs',
      {
        name: 't',
        spec: { title: 'x', sections: {} },
        model: { providerId: 'p', modelId: 'm' },
      },
      '/x/t.json',
    );
    expect(msg).toContain('design-brief');
  });
});

describe('writeCandidateChangelogAndAggregate', () => {
  it('writes changelog table rows and aggregate JSON', async () => {
    const cand = path.join(tmpRoot, 'cand');
    const tr = path.join(cand, 'test-results');
    await mkdir(path.join(tr, 'alpha'), { recursive: true });
    await mkdir(path.join(tr, 'beta'), { recursive: true });
    await writeFile(
      path.join(tr, 'alpha', ARTIFACT.summaryJson),
      JSON.stringify({ overallScore: 4.2, stopReason: 'satisfied' }),
      'utf8',
    );
    await writeFile(
      path.join(tr, 'beta', ARTIFACT.summaryJson),
      JSON.stringify({ overallScore: null, stopReason: null }),
      'utf8',
    );

    const testFiles = [path.join(tmpRoot, 'alpha.json'), path.join(tmpRoot, 'beta.json')];

    await writeCandidateChangelogAndAggregate({
      candidateDir: cand,
      candidateId: 3,
      meanScore: 4.0,
      scores: [4.2, 3.8],
      testFiles,
      testResultsDir: tr,
      proposalMd: 'Reasoning',
      args: baseArgs,
      aggregateIteration: 2,
      iterationLine: '2 / 5',
      includeProposerSection: true,
    });

    const changelog = await readFile(path.join(cand, ARTIFACT.changelogMd), 'utf8');
    expect(changelog).toContain('candidate-3');
    expect(changelog).toContain('What the proposer changed');
    expect(changelog).toContain('| alpha | 4.20 | satisfied |');
    expect(changelog).toContain('| beta | err | ? |');

    const agg = JSON.parse(await readFile(path.join(cand, ARTIFACT.aggregateJson), 'utf8')) as {
      candidateId: number;
      meanScore: number | null;
      scores: number[];
      iteration: number;
    };
    expect(agg).toEqual({
      candidateId: 3,
      meanScore: 4.0,
      scores: [4.2, 3.8],
      iteration: 2,
    });
  });

  it('uses Notes section when includeProposerSection is false', async () => {
    const cand = path.join(tmpRoot, 'c2');
    const tr = path.join(cand, 'test-results');
    await mkdir(tr, { recursive: true });

    await writeCandidateChangelogAndAggregate({
      candidateDir: cand,
      candidateId: 0,
      meanScore: null,
      scores: [],
      testFiles: [],
      testResultsDir: tr,
      proposalMd: 'Note only',
      args: baseArgs,
      aggregateIteration: 0,
      iterationLine: 'baseline',
      includeProposerSection: false,
    });

    const changelog = await readFile(path.join(cand, ARTIFACT.changelogMd), 'utf8');
    expect(changelog).toContain('## Notes');
    expect(changelog).not.toContain('What the proposer changed');
  });
});
