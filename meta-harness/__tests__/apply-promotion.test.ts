import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StalePrompt } from '../preflight-promotion-check.ts';
import {
  applyPromotion,
  copySkillFiles,
  escapeForTemplateLiteral,
  findClosingBacktick,
  findPromptEntryRange,
  patchRubricWeightsFile,
  patchSharedDefaults,
  promotionSucceeded,
} from '../apply-promotion.ts';

const spawnSyncMock = vi.hoisted(() =>
  vi.fn(() => ({
    status: 0 as number | null,
    stdout: 'sync ok\n',
    stderr: '',
    error: undefined as Error | undefined,
  })),
);

vi.mock('node:child_process', async (importOriginal) => {
  const cp = await importOriginal<typeof import('node:child_process')>();
  return { ...cp, spawnSync: spawnSyncMock };
});

vi.mock('../../server/lib/langfuse-app-client.ts', () => ({
  isLangfuseAppConfigured: () => true,
}));

describe('escapeForTemplateLiteral', () => {
  it('escapes backslashes, backticks, and ${', () => {
    expect(escapeForTemplateLiteral('a`b${c}\\d')).toBe('a\\`b\\${c}\\\\d');
  });
});

describe('findClosingBacktick', () => {
  it('finds end ignoring escaped backticks', () => {
    const s = "hello \\` inside `";
    expect(findClosingBacktick(s, 0)).toBe(s.length - 1);
  });

  it('skips over ${ ... }', () => {
    const s = 'before ${ foo({x: 1}) } after`';
    expect(findClosingBacktick(s, 0)).toBe(s.length - 1);
  });
});

describe('findPromptEntryRange', () => {
  it('locates body between backticks', () => {
    const src = `export const X = {
  'hypotheses-generator-system': \`BODY_HERE\`,
};`;
    const r = findPromptEntryRange(src, 'hypotheses-generator-system');
    expect(r).not.toBeNull();
    expect(src.slice(r!.bodyStart, r!.bodyEnd)).toBe('BODY_HERE');
  });
});

describe('patchSharedDefaults', () => {
  it('patches one key and leaves another untouched', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-apply-'));
    const p = path.join(root, 'shared-defaults.ts');
    const initial = `export const PROMPT_DEFAULTS: Record<string, string> = {
  'hypotheses-generator-system': \`OLD_A\`,
  'incubator-user-inputs': \`OLD_B\`,
};
`;
    await writeFile(p, initial, 'utf8');

    const staleFixed: StalePrompt[] = [
      { key: 'hypotheses-generator-system', liveBody: 'x', winnerBody: 'NEW_A' },
    ];

    const results = await patchSharedDefaults(p, staleFixed);
    expect(results).toEqual([{ key: 'hypotheses-generator-system', ok: true }]);

    const out = await readFile(p, 'utf8');
    expect(out).toContain('NEW_A');
    expect(out).toContain('OLD_B');
    expect(out).not.toContain('OLD_A');
  });

  it('fails cleanly when key is missing from file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-apply-miss-'));
    const p = path.join(root, 'shared-defaults.ts');
    await writeFile(
      p,
      `export const PROMPT_DEFAULTS: Record<string, string> = {
  'incubator-user-inputs': \`X\`,
};
`,
      'utf8',
    );
    const results = await patchSharedDefaults(p, [
      { key: 'hypotheses-generator-system', liveBody: '', winnerBody: 'Y' },
    ]);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toContain('not found');
  });
});

describe('copySkillFiles', () => {
  it('writes modified snapshot, removes added live file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-skills-'));
    const skillsDir = path.join(root, 'skills');
    await mkdir(path.join(skillsDir, 'pkg'), { recursive: true });
    await writeFile(path.join(skillsDir, 'pkg', 'SKILL.md'), 'live', 'utf8');
    await mkdir(path.join(skillsDir, 'orphan'), { recursive: true });
    await writeFile(path.join(skillsDir, 'orphan', 'SKILL.md'), 'only-live', 'utf8');

    const res = await copySkillFiles(skillsDir, [
      { relPath: 'pkg/SKILL.md', liveBody: 'live', winnerBody: 'snapshot', kind: 'modified' },
      { relPath: 'orphan/SKILL.md', liveBody: 'only-live', winnerBody: '', kind: 'added' },
    ]);

    expect(res.every((r) => r.ok)).toBe(true);
    expect(await readFile(path.join(skillsDir, 'pkg', 'SKILL.md'), 'utf8')).toBe('snapshot');
    await expect(readFile(path.join(skillsDir, 'orphan', 'SKILL.md'), 'utf8')).rejects.toThrow();
  });

  it('restores deleted skill from winner body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-skills-del-'));
    const skillsDir = path.join(root, 'skills');

    const res = await copySkillFiles(skillsDir, [
      { relPath: 'gone/SKILL.md', liveBody: '', winnerBody: 'restored', kind: 'deleted' },
    ]);

    expect(res[0]!.ok).toBe(true);
    expect(await readFile(path.join(skillsDir, 'gone', 'SKILL.md'), 'utf8')).toBe('restored');
  });
});

describe('promotionSucceeded', () => {
  it('requires sync exit 0 when sync ran', () => {
    expect(
      promotionSucceeded({
        promptsPatched: [{ key: 'k', ok: true }],
        skillsCopied: [],
        rubricWeightsPatched: null,
        langfuseSyncExitCode: 1,
        langfuseSyncOutput: 'bad',
      }),
    ).toBe(false);
    expect(
      promotionSucceeded({
        promptsPatched: [{ key: 'k', ok: true }],
        skillsCopied: [],
        rubricWeightsPatched: null,
        langfuseSyncExitCode: 0,
        langfuseSyncOutput: '',
      }),
    ).toBe(true);
    expect(
      promotionSucceeded({
        promptsPatched: [],
        skillsCopied: [],
        rubricWeightsPatched: null,
        langfuseSyncExitCode: null,
        langfuseSyncOutput: 'skip',
      }),
    ).toBe(true);
    expect(
      promotionSucceeded({
        promptsPatched: [],
        skillsCopied: [],
        rubricWeightsPatched: { ok: false, error: 'disk' },
        langfuseSyncExitCode: null,
        langfuseSyncOutput: 'skip',
      }),
    ).toBe(false);
  });
});

describe('patchRubricWeightsFile', () => {
  it('writes formatted JSON under src/lib/rubric-weights.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-rw-'));
    const weights = { design: 0.35, strategy: 0.3, implementation: 0.25, browser: 0.1 };
    const r = await patchRubricWeightsFile(root, weights);
    expect(r.ok).toBe(true);
    const p = path.join(root, 'src', 'lib', 'rubric-weights.json');
    const raw = await readFile(p, 'utf8');
    expect(JSON.parse(raw)).toEqual(weights);
  });
});

describe('applyPromotion', () => {
  beforeEach(() => {
    spawnSyncMock.mockImplementation(() => ({
      status: 0,
      stdout: 'updated\n',
      stderr: '',
      error: undefined,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skills-only drift skips Langfuse spawn', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-apply-full-'));
    const skillsDir = path.join(root, 'skills');
    await mkdir(path.join(skillsDir, 'x'), { recursive: true });
    await writeFile(path.join(skillsDir, 'x', 'SKILL.md'), 'live', 'utf8');

    const r = await applyPromotion(
      {
        sessionFolder: 'sess',
        candidateId: 0,
        meanScore: 1,
        stalePrompts: [],
        staleSkills: [
          { relPath: 'x/SKILL.md', liveBody: 'live', winnerBody: 'win', kind: 'modified' },
        ],
        staleRubricWeights: null,
        reportPath: 'r.md',
        allFetchesFailed: false,
      },
      root,
    );

    expect(r.promptsPatched).toHaveLength(0);
    expect(r.skillsCopied.every((s) => s.ok)).toBe(true);
    expect(r.rubricWeightsPatched).toBeNull();
    expect(r.langfuseSyncExitCode).toBeNull();
    expect(r.langfuseSyncOutput).toContain('No prompt');
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('rubric-only drift patches rubric-weights.json and skips Langfuse', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-rubric-only-'));
    const sd = path.join(root, 'src', 'lib', 'prompts');
    await mkdir(sd, { recursive: true });
    await writeFile(
      path.join(sd, 'shared-defaults.ts'),
      `export const PROMPT_DEFAULTS: Record<string, string> = {};`,
      'utf8',
    );
    await mkdir(path.join(root, 'skills'), { recursive: true });
    const lib = path.join(root, 'src', 'lib');
    await mkdir(lib, { recursive: true });
    await writeFile(
      path.join(lib, 'rubric-weights.json'),
      `${JSON.stringify(
        { design: 0.4, strategy: 0.3, implementation: 0.2, browser: 0.1 },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const winner = { design: 0.35, strategy: 0.3, implementation: 0.25, browser: 0.1 };
    const r = await applyPromotion(
      {
        sessionFolder: 'sess',
        candidateId: 2,
        meanScore: 4,
        stalePrompts: [],
        staleSkills: [],
        staleRubricWeights: {
          liveWeights: {
            design: 0.4,
            strategy: 0.3,
            implementation: 0.2,
            browser: 0.1,
          },
          winnerWeights: winner,
        },
        reportPath: 'r.md',
        allFetchesFailed: false,
      },
      root,
    );

    expect(r.rubricWeightsPatched?.ok).toBe(true);
    expect(JSON.parse(await readFile(path.join(lib, 'rubric-weights.json'), 'utf8'))).toEqual(winner);
    expect(r.langfuseSyncOutput).toContain('No prompt drift');
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('prompt drift runs patch then Langfuse sync', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-apply-prompt-'));
    const sd = path.join(root, 'src', 'lib', 'prompts');
    await mkdir(sd, { recursive: true });
    await writeFile(
      path.join(sd, 'shared-defaults.ts'),
      `export const PROMPT_DEFAULTS: Record<string, string> = {
  'hypotheses-generator-system': \`OLD\`,
};
`,
      'utf8',
    );
    await mkdir(path.join(root, 'skills'), { recursive: true });

    const r = await applyPromotion(
      {
        sessionFolder: 'sess',
        candidateId: 0,
        meanScore: 1,
        stalePrompts: [{ key: 'hypotheses-generator-system', liveBody: 'a', winnerBody: 'NEW' }],
        staleSkills: [],
        staleRubricWeights: null,
        reportPath: 'r.md',
        allFetchesFailed: false,
      },
      root,
    );

    expect(r.promptsPatched.every((p) => p.ok)).toBe(true);
    expect(r.langfuseSyncExitCode).toBe(0);
    expect(spawnSyncMock).toHaveBeenCalled();
    const out = await readFile(path.join(sd, 'shared-defaults.ts'), 'utf8');
    expect(out).toContain('NEW');
  });
});
