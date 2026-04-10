import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  applyPromotion,
  copySkillFiles,
  patchRubricWeightsFile,
  promotionSucceeded,
} from '../apply-promotion.ts';

describe('copySkillFiles', () => {
  it('writes modified snapshot, removes added live file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-skills-'));
    const skillsDir = path.join(root, 'skills');
    await mkdir(path.join(skillsDir, 'pkg'), { recursive: true });
    await writeFile(path.join(skillsDir, 'pkg', 'SKILL.md'), 'live', 'utf8');
    await mkdir(path.join(skillsDir, 'orphan'), { recursive: true });
    await writeFile(path.join(skillsDir, 'orphan', 'SKILL.md'), 'only-live', 'utf8');

    const res = await copySkillFiles(root, skillsDir, [
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

    const res = await copySkillFiles(root, skillsDir, [
      { relPath: 'gone/SKILL.md', liveBody: '', winnerBody: 'restored', kind: 'deleted' },
    ]);

    expect(res[0]!.ok).toBe(true);
    expect(await readFile(path.join(skillsDir, 'gone', 'SKILL.md'), 'utf8')).toBe('restored');
  });
});

describe('promotionSucceeded', () => {
  it('succeeds when all skills and rubric are ok', () => {
    expect(
      promotionSucceeded({
        skillsCopied: [{ relPath: 'x', ok: true }],
        rubricWeightsPatched: null,
      }),
    ).toBe(true);
  });

  it('fails when a skill copy failed', () => {
    expect(
      promotionSucceeded({
        skillsCopied: [{ relPath: 'x', ok: false, error: 'disk' }],
        rubricWeightsPatched: null,
      }),
    ).toBe(false);
  });

  it('fails when rubric weights patch failed', () => {
    expect(
      promotionSucceeded({
        skillsCopied: [],
        rubricWeightsPatched: { ok: false, error: 'disk' },
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
  it('skills-only drift applies skill files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-apply-full-'));
    const skillsDir = path.join(root, 'skills');
    await mkdir(path.join(skillsDir, 'x'), { recursive: true });
    await writeFile(path.join(skillsDir, 'x', 'SKILL.md'), 'live', 'utf8');

    const r = await applyPromotion(
      {
        sessionFolder: 'sess',
        candidateId: 0,
        meanScore: 1,
        staleSkills: [
          { relPath: 'x/SKILL.md', liveBody: 'live', winnerBody: 'win', kind: 'modified' },
        ],
        staleRubricWeights: null,
        reportPath: 'r.md',
      },
      root,
    );

    expect(r.skillsCopied.every((s) => s.ok)).toBe(true);
    expect(r.rubricWeightsPatched).toBeNull();
  });

  it('rubric-only drift patches rubric-weights.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-rubric-only-'));
    const lib = path.join(root, 'src', 'lib');
    await mkdir(lib, { recursive: true });
    await mkdir(path.join(root, 'skills'), { recursive: true });

    const winner = { design: 0.35, strategy: 0.3, implementation: 0.25, browser: 0.1 };
    const r = await applyPromotion(
      {
        sessionFolder: 'sess',
        candidateId: 2,
        meanScore: 4,
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
      },
      root,
    );

    expect(r.rubricWeightsPatched?.ok).toBe(true);
    expect(JSON.parse(await readFile(path.join(lib, 'rubric-weights.json'), 'utf8'))).toEqual(winner);
  });

  it('writes .prompt-versions manifest entries when promoting skills and rubric', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-vstore-promo-'));
    const skillsDir = path.join(root, 'skills');
    await mkdir(path.join(skillsDir, 'x'), { recursive: true });
    await writeFile(path.join(skillsDir, 'x', 'SKILL.md'), 'live-skill', 'utf8');
    const lib = path.join(root, 'src', 'lib');
    await mkdir(lib, { recursive: true });
    await writeFile(
      path.join(lib, 'rubric-weights.json'),
      `${JSON.stringify({ design: 0.4, strategy: 0.3, implementation: 0.2, browser: 0.1 }, null, 2)}\n`,
      'utf8',
    );

    const winner = { design: 0.35, strategy: 0.3, implementation: 0.25, browser: 0.1 };
    const r = await applyPromotion(
      {
        sessionFolder: 'sess',
        candidateId: 0,
        meanScore: 1,
        staleSkills: [
          { relPath: 'x/SKILL.md', liveBody: 'live-skill', winnerBody: 'win-skill', kind: 'modified' },
        ],
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
      },
      root,
    );

    expect(promotionSucceeded(r)).toBe(true);
    const manifestPath = path.join(root, '.prompt-versions', 'manifest.jsonl');
    const manifest = await readFile(manifestPath, 'utf8');
    const lines = manifest
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { path: string; source: string });
    expect(lines.some((row) => row.path === 'skills/x/SKILL.md')).toBe(true);
    expect(lines.some((row) => row.path === 'src/lib/rubric-weights.json')).toBe(true);
    expect(lines.every((row) => row.source.startsWith('meta-harness:promotion:'))).toBe(true);
  });
});
