/**
 * Entry guards for runMetaHarnessEngine (cheap failures before heavy work).
 */
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaHarnessCliArgs } from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';

const { listTestCaseFilesMock, createMetaHarnessSessionMock } = vi.hoisted(() => ({
  listTestCaseFilesMock: vi.fn(),
  createMetaHarnessSessionMock: vi.fn(),
}));

vi.mock('../session.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../session.ts')>();
  return {
    ...mod,
    listTestCaseFiles: listTestCaseFilesMock,
    createMetaHarnessSession: createMetaHarnessSessionMock,
  };
});

import { runMetaHarnessEngine } from '../runner-core.ts';

const stubCallbacks: RunnerCallbacks = {
  onPreflight: vi.fn(),
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

const baseCfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001/api',
  iterations: 1,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
};

describe('runMetaHarnessEngine guards', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    listTestCaseFilesMock.mockReset();
    createMetaHarnessSessionMock.mockReset();
    createMetaHarnessSessionMock.mockResolvedValue({
      sessionDir: path.join(path.sep, 'tmp', 'mh-sess'),
      sessionFolderName: 'session-test',
    });
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (origKey !== undefined) process.env.OPENROUTER_API_KEY = origKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  it('throws when no test-case JSON files exist', async () => {
    listTestCaseFilesMock.mockResolvedValue([]);

    const args: MetaHarnessCliArgs = {
      mode: 'design',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    await expect(runMetaHarnessEngine(args, stubCallbacks, { config: baseCfg })).rejects.toThrow(
      /No test cases in/,
    );
    expect(createMetaHarnessSessionMock).not.toHaveBeenCalled();
  });

  it('throws when --test filters match no basenames', async () => {
    listTestCaseFilesMock.mockResolvedValue([path.join('meta-harness', 'test-cases', 'alpha.json')]);

    const args: MetaHarnessCliArgs = {
      mode: 'design',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: ['does-not-exist-substring-xyz'],
    };

    await expect(runMetaHarnessEngine(args, stubCallbacks, { config: baseCfg })).rejects.toThrow(
      /No test cases after filters.*--test=/s,
    );
    expect(createMetaHarnessSessionMock).not.toHaveBeenCalled();
  });

  it('throws when OPENROUTER_API_KEY is missing and proposer would run', async () => {
    listTestCaseFilesMock.mockResolvedValue([path.join('meta-harness', 'test-cases', 'alpha.json')]);

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

    await expect(runMetaHarnessEngine(args, stubCallbacks, { config: baseCfg })).rejects.toThrow(
      /OPENROUTER_API_KEY/,
    );
    expect(createMetaHarnessSessionMock).toHaveBeenCalled();
  });

  it('throws in incubate mode with --eval-only when OPENROUTER_API_KEY is missing', async () => {
    listTestCaseFilesMock.mockResolvedValue([path.join('meta-harness', 'test-cases', 'alpha.json')]);

    const args: MetaHarnessCliArgs = {
      mode: 'incubate',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    await expect(runMetaHarnessEngine(args, stubCallbacks, { config: baseCfg })).rejects.toThrow(
      /incubate mode needs OPENROUTER_API_KEY/,
    );
    expect(createMetaHarnessSessionMock).toHaveBeenCalled();
  });

  it('throws in inputs mode with --eval-only when OPENROUTER_API_KEY is missing', async () => {
    listTestCaseFilesMock.mockResolvedValue([path.join('meta-harness', 'test-cases', 'alpha.json')]);

    const args: MetaHarnessCliArgs = {
      mode: 'inputs',
      once: false,
      evalOnly: true,
      dryRun: false,
      plain: true,
      skipPromotionCheck: true,
      promoteOnly: false,
      testFilters: [],
    };

    await expect(runMetaHarnessEngine(args, stubCallbacks, { config: baseCfg })).rejects.toThrow(
      /inputs mode needs OPENROUTER_API_KEY/,
    );
    expect(createMetaHarnessSessionMock).toHaveBeenCalled();
  });
});
