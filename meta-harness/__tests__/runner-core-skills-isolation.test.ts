/**
 * Ensures skills/ is restored from session baseline after each candidate and in finally.
 */
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import { ARTIFACT } from '../constants.ts';

const { repoRootMock, runMetaHarnessProposerMock, runTestCasesEvaluationMock } = vi.hoisted(() => ({
  repoRootMock: vi.fn(),
  runMetaHarnessProposerMock: vi.fn(),
  runTestCasesEvaluationMock: vi.fn(),
}));

vi.mock('../paths.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../paths.ts')>();
  return {
    ...mod,
    repoRoot: repoRootMock,
  };
});

vi.mock('../proposer.ts', () => ({
  runMetaHarnessProposer: runMetaHarnessProposerMock,
}));

vi.mock('../candidate-eval.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../candidate-eval.ts')>();
  return {
    ...mod,
    runTestCasesEvaluation: runTestCasesEvaluationMock,
  };
});

import { runMetaHarnessEngine } from '../runner-core.ts';

const baseCfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:4731/api',
  iterations: 2,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
};

function stubCallbacks(): RunnerCallbacks {
  return {
    onPreflight: vi.fn(),
    onBaselineStart: vi.fn(),
    onIterationStart: vi.fn(),
    onProposerStart: vi.fn(),
    onProposerToolCall: vi.fn(),
    onProposerDone: vi.fn(),
    onTestCaseStart: vi.fn(),
    onWireEvent: vi.fn(),
    onTestCaseDone: vi.fn(),
    onIterationDone: vi.fn(),
    onComplete: vi.fn(),
  } as unknown as RunnerCallbacks;
}

async function setupFixture(): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'mh-skill-iso-'));
  await mkdir(path.join(fixtureRoot, 'meta-harness', 'test-cases'), { recursive: true });
  await writeFile(path.join(fixtureRoot, 'meta-harness', 'test-cases', 'alpha.json'), '{}', 'utf8');
  await mkdir(path.join(fixtureRoot, 'skills', 'base-skill'), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, 'skills', 'base-skill', 'SKILL.md'),
    'baseline body\n',
    'utf8',
  );
  return fixtureRoot;
}

describe('runMetaHarnessEngine skills isolation', () => {
  const origKey = process.env.OPENROUTER_API_KEY;
  let fixtureRoot: string;

  beforeEach(async () => {
    fixtureRoot = await setupFixture();
    repoRootMock.mockReturnValue(fixtureRoot);
    process.env.OPENROUTER_API_KEY = 'test-key';
    runMetaHarnessProposerMock.mockReset();
    runTestCasesEvaluationMock.mockReset();
    runTestCasesEvaluationMock.mockImplementation(async (params: { candidateDir: string }) => {
      const testResultsDir = path.join(params.candidateDir, 'test-results');
      await mkdir(path.join(testResultsDir, 'alpha'), { recursive: true });
      await writeFile(
        path.join(testResultsDir, 'alpha', ARTIFACT.summaryJson),
        JSON.stringify({ overallScore: 5, stopReason: 'ok' }),
        'utf8',
      );
      return { meanScore: 5, scores: [5], testResultsDir };
    });
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
    if (origKey !== undefined) process.env.OPENROUTER_API_KEY = origKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  it('restores repo skills after each proposer round and in finally', async () => {
    let round = 0;
    runMetaHarnessProposerMock.mockImplementation(async () => {
      round += 1;
      const ephemeral = path.join(fixtureRoot, 'skills', 'ephemeral', 'SKILL.md');
      await expect(access(ephemeral)).rejects.toMatchObject({ code: 'ENOENT' });
      await mkdir(path.dirname(ephemeral), { recursive: true });
      await writeFile(ephemeral, `round-${round}\n`, 'utf8');
      return {
        reasoning: 'r',
        roundsUsed: 1,
        toolLog: [],
      };
    });

    const args: MetaHarnessCliArgs = {
      mode: 'design',
      once: false,
      evalOnly: false,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    await runMetaHarnessEngine(args, stubCallbacks(), { config: baseCfg });

    expect(round).toBe(2);
    await expect(access(path.join(fixtureRoot, 'skills', 'ephemeral'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const top = await readdir(path.join(fixtureRoot, 'skills'));
    expect(top.sort()).toEqual(['base-skill']);
  });

  it('restores repo skills in finally when the proposer throws mid-run', async () => {
    runMetaHarnessProposerMock
      .mockImplementationOnce(async () => {
        const ephemeral = path.join(fixtureRoot, 'skills', 'ephemeral', 'SKILL.md');
        await mkdir(path.dirname(ephemeral), { recursive: true });
        await writeFile(ephemeral, 'once\n', 'utf8');
        return {
          reasoning: 'r',
          roundsUsed: 1,
          toolLog: [],
        };
      })
      .mockImplementationOnce(async () => {
        throw new Error('proposer boom');
      });

    const args: MetaHarnessCliArgs = {
      mode: 'design',
      once: false,
      evalOnly: false,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    await expect(runMetaHarnessEngine(args, stubCallbacks(), { config: baseCfg })).rejects.toThrow(
      /proposer boom/,
    );

    await expect(access(path.join(fixtureRoot, 'skills', 'ephemeral'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await readdir(path.join(fixtureRoot, 'skills'))).sort()).toEqual(['base-skill']);
  });

  it('writes skills-snapshot under each candidate with that candidate tree only', async () => {
    let round = 0;
    runMetaHarnessProposerMock.mockImplementation(async () => {
      round += 1;
      const skillDir = path.join(fixtureRoot, 'skills', `only-${round}`);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), `content-${round}\n`, 'utf8');
      return {
        reasoning: 'r',
        roundsUsed: 1,
        toolLog: [],
      };
    });

    const args: MetaHarnessCliArgs = {
      mode: 'design',
      once: false,
      evalOnly: false,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    await runMetaHarnessEngine(args, stubCallbacks(), { config: baseCfg });

    const hist = path.join(fixtureRoot, 'meta-harness', 'history');
    const sessions = (await readdir(hist)).filter((n) => n.startsWith('session-'));
    expect(sessions.length).toBe(1);
    const sessionDir = path.join(hist, sessions[0]!);

    const snap1 = path.join(sessionDir, 'candidate-1', ARTIFACT.skillsSnapshot, 'only-1', 'SKILL.md');
    const snap2 = path.join(sessionDir, 'candidate-2', ARTIFACT.skillsSnapshot, 'only-2', 'SKILL.md');
    expect(await readFile(snap1, 'utf8')).toBe('content-1\n');
    expect(await readFile(snap2, 'utf8')).toBe('content-2\n');
    await expect(
      access(path.join(sessionDir, 'candidate-2', ARTIFACT.skillsSnapshot, 'only-1')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
