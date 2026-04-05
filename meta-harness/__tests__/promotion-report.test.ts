import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffSkillTrees, generatePromotionReportMarkdown } from '../promotion-report.ts';

const tmpRoot = path.join(import.meta.dirname, '.tmp-promotion-report');

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('diffSkillTrees', () => {
  it('reports identical trees', async () => {
    const a = path.join(tmpRoot, 'a');
    const b = path.join(tmpRoot, 'b');
    await mkdir(path.join(a, 'x'), { recursive: true });
    await mkdir(path.join(b, 'x'), { recursive: true });
    await writeFile(path.join(a, 'x', 'f.txt'), 'hello');
    await writeFile(path.join(b, 'x', 'f.txt'), 'hello');
    const d = await diffSkillTrees(a, b);
    expect(d.added).toEqual([]);
    expect(d.deleted).toEqual([]);
    expect(d.modified).toEqual([]);
    expect(d.unchanged).toBe(1);
  });

  it('reports modified, added, and deleted files', async () => {
    const snap = path.join(tmpRoot, 'snap');
    const live = path.join(tmpRoot, 'live');
    await mkdir(path.join(snap, 'pkg'), { recursive: true });
    await mkdir(path.join(live, 'pkg'), { recursive: true });
    await writeFile(path.join(snap, 'pkg', 'SKILL.md'), 'v1');
    await writeFile(path.join(live, 'pkg', 'SKILL.md'), 'v2');
    await writeFile(path.join(snap, 'only-snap.txt'), 'x');
    await writeFile(path.join(live, 'only-live.txt'), 'y');
    const d = await diffSkillTrees(snap, live);
    expect(d.modified.map((m) => m.relPath)).toEqual(['pkg/SKILL.md']);
    expect(d.deleted).toEqual(['only-snap.txt']);
    expect(d.added).toEqual(['only-live.txt']);
    expect(d.unchanged).toBe(0);
  });
});

describe('generatePromotionReportMarkdown', () => {
  it('includes baseline interpretation when winning candidate is 0', async () => {
    const repo = path.join(tmpRoot, 'repo');
    const winner = path.join(tmpRoot, 'c0');
    await mkdir(path.join(repo, 'skills'), { recursive: true });
    await mkdir(path.join(winner, 'skills-snapshot'), { recursive: true });
    await mkdir(path.join(repo, 'meta-harness', 'test-cases'), { recursive: true });
    await writeFile(path.join(winner, 'proposal.md'), '# Baseline\n', 'utf8');
    await writeFile(path.join(winner, 'prompt-overrides.json'), '{}\n', 'utf8');

    const { markdown } = await generatePromotionReportMarkdown({
      repoRoot: repo,
      winningCandidateDir: winner,
      winningCandidateId: 0,
      winningMeanScore: 4,
      mode: 'compile',
      candidateRows: [
        { candidateId: 0, meanScore: 4, iteration: 0 },
        { candidateId: 1, meanScore: 3.9, iteration: 1 },
      ],
      initialTestCaseNames: new Set(),
      currentTestCasesDir: path.join(repo, 'meta-harness', 'test-cases'),
    });

    expect(markdown).toContain('Interpreting a baseline win');
    expect(markdown).toContain('strictly higher');
  });
});
