import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  computeHash,
  diffVersions,
  enumerateVersionedFiles,
  listVersions,
  restoreVersion,
  snapAll,
  snapshotBeforeWrite,
  snapshotDirForRelPath,
  toSafeTimestamp,
  VERSION_STORE_DIR,
} from '../version-store.ts';

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

describe('version-store', () => {
  it('toSafeTimestamp has no colons or dots', () => {
    const s = toSafeTimestamp(new Date('2026-04-10T14:30:00.123Z'));
    expect(s).not.toContain(':');
    expect(s).not.toContain('.');
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/u);
  });

  it('computeHash is stable', () => {
    expect(computeHash('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('snapshotBeforeWrite is a no-op when file does not exist (update)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-miss-'));
    const r = await snapshotBeforeWrite({
      repoRoot: root,
      relPath: 'packages/auto-designer-pi/skills/x/SKILL.md',
      source: 'test',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toBe(true);
    if (r.ok && r.skipped) expect(r.reason).toBe('missing_file');
  });

  it('snapshotBeforeWrite writes snapshot and manifest line', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-snap-'));
    const skillDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg');
    await mkdir(skillDir, { recursive: true });
    const work = path.join(skillDir, 'SKILL.md');
    await writeFile(work, 'content-a', 'utf8');

    const r = await snapshotBeforeWrite({
      repoRoot: root,
      relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md',
      source: 'test:update',
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.skipped) throw new Error('expected snapshot');
    expect(r.hash).toBe(computeHash('content-a'));

    const manifest = await readFile(path.join(root, VERSION_STORE_DIR, 'manifest.jsonl'), 'utf8');
    const line = manifest.trim().split('\n').pop();
    expect(line).toBeDefined();
    const row = JSON.parse(line!) as Record<string, unknown>;
    expect(row.path).toBe('packages/auto-designer-pi/skills/pkg/SKILL.md');
    expect(row.action).toBe('update');
    expect(row.source).toBe('test:update');
    expect(row.hash).toBe(computeHash('content-a'));
    expect(String(row.snapshotFile)).toMatch(
      /^packages\/auto-designer-pi\/skills\/pkg\/_versions\//u,
    );

    const snapDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg', '_versions');
    const snaps = await readdir(snapDir);
    expect(snaps).toHaveLength(1);
    expect(await readFile(path.join(snapDir, snaps[0]!), 'utf8')).toBe('content-a');
  });

  it('listVersions returns newest first', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-list-'));
    const skillDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg');
    await mkdir(skillDir, { recursive: true });
    const work = path.join(skillDir, 'SKILL.md');

    await writeFile(work, 'v1', 'utf8');
    let sn = await snapshotBeforeWrite({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md', source: 't1' });
    if (!sn.ok || sn.skipped) throw new Error('snap');
    await writeFile(work, 'v2', 'utf8');
    sn = await snapshotBeforeWrite({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md', source: 't2' });
    if (!sn.ok || sn.skipped) throw new Error('snap2');
    await writeFile(work, 'v3', 'utf8');

    const list = await listVersions({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md' });
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0]!.hash).toBe(computeHash('v2'));
    expect(list[1]!.hash).toBe(computeHash('v1'));
    expect(await readFile(work, 'utf8')).toBe('v3');
  });

  it('restoreVersion backs up current then restores prior', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-rest-'));
    const skillDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg');
    await mkdir(skillDir, { recursive: true });
    const work = path.join(skillDir, 'SKILL.md');

    await writeFile(work, 'v1', 'utf8');
    const sn0 = await snapshotBeforeWrite({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md', source: 't1' });
    if (!sn0.ok || sn0.skipped) throw new Error('snap');
    await writeFile(work, 'v2', 'utf8');

    const entries = await listVersions({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md' });
    const ts = entries[entries.length - 1]!.safeTs;

    const rr = await restoreVersion({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md', ts });
    expect(rr.ok).toBe(true);
    expect(await readFile(work, 'utf8')).toBe('v1');

    const after = await listVersions({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md' });
    expect(after[0]!.hash).toBe(computeHash('v2'));
  });

  let hasGit = false;
  beforeAll(() => {
    hasGit = gitAvailable();
  });

  it('diffVersions returns unified diff', async () => {
    if (!hasGit) {
      console.warn('[version-store.test] skip diff: git not available');
      return;
    }
    const root = await mkdtemp(path.join(tmpdir(), 'vs-diff-'));
    const skillDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg');
    await mkdir(skillDir, { recursive: true });
    const work = path.join(skillDir, 'SKILL.md');

    await writeFile(work, 'line1\n', 'utf8');
    const sn1 = await snapshotBeforeWrite({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md', source: 'd1' });
    if (!sn1.ok || sn1.skipped) throw new Error('snap');
    await writeFile(work, 'line2\n', 'utf8');
    const sn2 = await snapshotBeforeWrite({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md', source: 'd2' });
    if (!sn2.ok || sn2.skipped) throw new Error('snap2');
    await writeFile(work, 'line3\n', 'utf8');

    const list = await listVersions({ repoRoot: root, relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md' });
    expect(list.length).toBeGreaterThanOrEqual(2);
    const out = diffVersions({
      repoRoot: root,
      relPath: 'packages/auto-designer-pi/skills/pkg/SKILL.md',
      tsA: list[1]!.safeTs,
      tsB: list[0]!.safeTs,
    });
    expect(out).toContain('line1');
    expect(out).toContain('line2');
  });

  it('enumerateVersionedFiles lists package skills, package prompts, and the rubric JSON', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-enum-'));
    const pkgSkills = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'a');
    const pkgPrompts = path.join(root, 'packages', 'auto-designer-pi', 'prompts');
    await mkdir(pkgSkills, { recursive: true });
    await writeFile(path.join(pkgSkills, 'SKILL.md'), 'x', 'utf8');
    await mkdir(pkgPrompts, { recursive: true });
    await writeFile(path.join(pkgPrompts, 'gen-foo.md'), 'fm', 'utf8');
    await writeFile(path.join(pkgPrompts, '_designer-system.md'), 'sys', 'utf8');
    // _versions/ subdir should be ignored.
    await mkdir(path.join(pkgPrompts, '_versions', 'gen-foo'), { recursive: true });
    await writeFile(path.join(pkgPrompts, '_versions', 'gen-foo', '2026-01-01T00-00-00-000Z.md'), 'old', 'utf8');
    await mkdir(path.join(root, 'src', 'lib'), { recursive: true });
    await writeFile(path.join(root, 'src', 'lib', 'rubric-weights.json'), '{}', 'utf8');

    const paths = await enumerateVersionedFiles(root);
    expect(paths).toContain('packages/auto-designer-pi/skills/a/SKILL.md');
    expect(paths).toContain('packages/auto-designer-pi/prompts/gen-foo.md');
    expect(paths).toContain('packages/auto-designer-pi/prompts/_designer-system.md');
    expect(paths).toContain('src/lib/rubric-weights.json');
    expect(paths.some((p) => p.includes('_versions'))).toBe(false);
  });

  it('snapAll skips when file hash matches latest snapshot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-snapall-'));
    const skillDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg');
    await mkdir(skillDir, { recursive: true });
    const work = path.join(skillDir, 'SKILL.md');
    await writeFile(work, 'same', 'utf8');

    const r1 = await snapAll(root, 'test');
    expect(r1.saved).toContain('packages/auto-designer-pi/skills/pkg/SKILL.md');

    const r2 = await snapAll(root, 'test');
    expect(r2.saved).toHaveLength(0);
    expect(r2.unchanged).toContain('packages/auto-designer-pi/skills/pkg/SKILL.md');
  });

  it('snapAll saves again after file content changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-snapall2-'));
    const skillDir = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg');
    await mkdir(skillDir, { recursive: true });
    const work = path.join(skillDir, 'SKILL.md');
    await writeFile(work, 'v1', 'utf8');
    await snapAll(root, 't');
    await writeFile(work, 'v2', 'utf8');
    const r = await snapAll(root, 't');
    expect(r.saved).toContain('packages/auto-designer-pi/skills/pkg/SKILL.md');
    const vers = path.join(root, 'packages', 'auto-designer-pi', 'skills', 'pkg', '_versions');
    const files = await readdir(vers);
    expect(files.filter((f) => f.endsWith('.md')).length).toBeGreaterThanOrEqual(2);
  });

  it('snapshotDirForRelPath maps package skills + prompts to their _versions dirs', () => {
    const root = '/repo';
    expect(
      snapshotDirForRelPath(root, 'packages/auto-designer-pi/skills/foo/SKILL.md'),
    ).toBe(
      path.join('/repo', 'packages', 'auto-designer-pi', 'skills', 'foo', '_versions'),
    );
    expect(
      snapshotDirForRelPath(root, 'packages/auto-designer-pi/prompts/gen-foo.md'),
    ).toBe(
      path.join('/repo', 'packages', 'auto-designer-pi', 'prompts', '_versions', 'gen-foo'),
    );
    expect(
      snapshotDirForRelPath(root, 'packages/auto-designer-pi/prompts/_designer-system.md'),
    ).toBe(
      path.join('/repo', 'packages', 'auto-designer-pi', 'prompts', '_versions', '_designer-system'),
    );
  });
});
