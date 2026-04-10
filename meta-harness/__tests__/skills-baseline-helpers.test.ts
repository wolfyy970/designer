import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { restoreSkillsFromBaseline, saveSkillsBaseline } from '../snapshot-helpers.ts';

describe('saveSkillsBaseline / restoreSkillsFromBaseline', () => {
  let roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.map((r) => rm(r, { recursive: true, force: true }).catch(() => undefined)),
    );
    roots = [];
  });

  it('copies an existing skills tree and round-trips restore', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-sk-base-'));
    roots.push(root);
    const skillsDir = path.join(root, 'skills');
    const baselineDir = path.join(root, 'skills-baseline');
    await mkdir(path.join(skillsDir, 'pkg-a'), { recursive: true });
    await writeFile(path.join(skillsDir, 'pkg-a', 'SKILL.md'), 'hello\n', 'utf8');

    await saveSkillsBaseline(skillsDir, baselineDir);
    await writeFile(path.join(skillsDir, 'pkg-a', 'SKILL.md'), 'mutated\n', 'utf8');
    await mkdir(path.join(skillsDir, 'extra'), { recursive: true });
    await writeFile(path.join(skillsDir, 'extra', 'SKILL.md'), 'x\n', 'utf8');

    await restoreSkillsFromBaseline(skillsDir, baselineDir);
    expect(await readFile(path.join(skillsDir, 'pkg-a', 'SKILL.md'), 'utf8')).toBe('hello\n');
    await expect(readdir(skillsDir)).resolves.toEqual(['pkg-a']);
  });

  it('treats missing skills/ as an empty baseline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-sk-empty-'));
    roots.push(root);
    const skillsDir = path.join(root, 'skills');
    const baselineDir = path.join(root, 'skills-baseline');

    await saveSkillsBaseline(skillsDir, baselineDir);
    await mkdir(path.join(skillsDir, 'ghost'), { recursive: true });
    await writeFile(path.join(skillsDir, 'ghost', 'SKILL.md'), 'x\n', 'utf8');

    await restoreSkillsFromBaseline(skillsDir, baselineDir);
    await expect(readdir(skillsDir)).resolves.toEqual([]);
  });
});
