import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildSandboxSeedMaps,
  computeDesignFilesBeyondSeed,
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
  snapshotDesignFiles,
} from '../virtual-workspace.ts';

describe('virtual-workspace', () => {
  it('maps seedFiles under project root', () => {
    const files = buildSandboxSeedMaps({
      seedFiles: { 'skills/x/SKILL.md': 'skill', 'index.html': '<html></html>' },
    });
    expect(files[`${SANDBOX_PROJECT_ROOT}/skills/x/SKILL.md`]).toBe('skill');
    expect(files[`${SANDBOX_PROJECT_ROOT}/index.html`]).toBe('<html></html>');
  });

  it('extractDesignFiles returns all files in the sandbox tree', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'app.js': 'x', 'skills/s/SKILL.md': 'ro' },
    });
    const map = await extractDesignFiles(bash);
    expect(map['app.js']).toBe('x');
    expect(map['skills/s/SKILL.md']).toBe('ro');
  });

  it('extracts nothing when no seed files exist', async () => {
    const bash = createAgentBashSandbox({});
    const map = await extractDesignFiles(bash);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('round-trips deeply nested seed paths', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'a/b/c/d/e.txt': 'deep' },
    });
    const map = await extractDesignFiles(bash);
    expect(map['a/b/c/d/e.txt']).toBe('deep');
  });

  it('strips leading slashes from seed keys', () => {
    const files = buildSandboxSeedMaps({
      seedFiles: { '/index.html': '<p>x</p>' } as Record<string, string>,
    });
    expect(files[`${SANDBOX_PROJECT_ROOT}/index.html`]).toBe('<p>x</p>');
  });

  it('uses normalized seed keys when duplicate relative and absolute paths are provided', () => {
    const files = buildSandboxSeedMaps({
      seedFiles: { 'index.html': 'first', '/index.html': 'second' },
    });
    expect(files[`${SANDBOX_PROJECT_ROOT}/index.html`]).toBe('second');
  });

  it('preserves empty seeded file content', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'empty.txt': '' } });
    const map = await extractDesignFiles(bash);
    expect(map).toHaveProperty('empty.txt', '');
  });

  it('extractDesignFiles includes files written after construction', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'a.txt': '1' } });
    const p = path.posix.join(SANDBOX_PROJECT_ROOT, 'b.txt');
    await bash.fs.mkdir(path.posix.dirname(p), { recursive: true });
    await bash.fs.writeFile(p, '2', 'utf8');
    const map = await extractDesignFiles(bash);
    expect(map['a.txt']).toBe('1');
    expect(map['b.txt']).toBe('2');
  });

  it('extract omits a file removed via shell', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'gone.txt': 'bye' } });
    await bash.exec(`rm ${SANDBOX_PROJECT_ROOT}/gone.txt`, {});
    const map = await extractDesignFiles(bash);
    expect(map['gone.txt']).toBeUndefined();
  });

  it('SANDBOX_PROJECT_ROOT is the documented virtual root', () => {
    expect(SANDBOX_PROJECT_ROOT).toBe('/home/user/project');
  });

  it('snapshotDesignFiles returns a Map with relative path keys', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'x/y.txt': 'z' } });
    const snap = await snapshotDesignFiles(bash);
    expect(snap.get('x/y.txt')).toBe('z');
    expect([...snap.keys()].every((k) => !k.startsWith('/'))).toBe(true);
  });

  it('computeDesignFilesBeyondSeed excludes unchanged seed paths', () => {
    const seed = { 'skills/a/SKILL.md': 'orig', 'AGENTS.md': 'agents' };
    const extracted = { ...seed, 'new.html': '<p>x</p>' };
    const beyond = computeDesignFilesBeyondSeed(extracted, seed);
    expect(Object.keys(beyond)).toEqual(['new.html']);
  });

  it('computeDesignFilesBeyondSeed includes paths whose content changed vs seed', () => {
    const seed = { 'index.html': '<old>' };
    const extracted = { 'index.html': '<new>' };
    expect(computeDesignFilesBeyondSeed(extracted, seed)).toEqual({ 'index.html': '<new>' });
  });

  it('computeDesignFilesBeyondSeed preserves newly created empty files', () => {
    const seed = { 'index.html': '<html></html>' };
    const extracted = { ...seed, 'empty.txt': '' };
    expect(computeDesignFilesBeyondSeed(extracted, seed)).toEqual({ 'empty.txt': '' });
  });

  it('computeDesignFilesBeyondSeed returns full map when no seed', () => {
    const extracted = { 'a.txt': '1' };
    expect(computeDesignFilesBeyondSeed(extracted, undefined)).toEqual({ 'a.txt': '1' });
  });

  it('extracts a large batch of seeded files', async () => {
    const seeds: Record<string, string> = {};
    for (let i = 0; i < 100; i++) seeds[`batch/f${i}.txt`] = String(i);
    const bash = createAgentBashSandbox({ seedFiles: seeds });
    const map = await extractDesignFiles(bash);
    expect(Object.keys(map)).toHaveLength(100);
    expect(map['batch/f99.txt']).toBe('99');
  });
});
