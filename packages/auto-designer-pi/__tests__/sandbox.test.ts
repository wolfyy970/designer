import { describe, it, expect } from 'vitest';
import {
  SANDBOX_PROJECT_ROOT,
  buildSandboxSeedMaps,
  computeDesignFilesBeyondSeed,
  createAgentBashSandbox,
  extractDesignFiles,
  sandboxProjectAbsPath,
  snapshotDesignFiles,
} from '../src/sandbox/virtual-workspace';

describe('virtual-workspace', () => {
  it('sandboxProjectAbsPath joins relative paths under the project root', () => {
    expect(sandboxProjectAbsPath('index.html')).toBe(`${SANDBOX_PROJECT_ROOT}/index.html`);
    expect(sandboxProjectAbsPath('/leading-slash.css')).toBe(`${SANDBOX_PROJECT_ROOT}/leading-slash.css`);
    expect(sandboxProjectAbsPath('nested/file.js')).toBe(`${SANDBOX_PROJECT_ROOT}/nested/file.js`);
  });

  it('buildSandboxSeedMaps prefixes seed paths with the project root', () => {
    const out = buildSandboxSeedMaps({ seedFiles: { 'a.html': '<a>', 'sub/b.css': 'b{}' } });
    expect(out).toEqual({
      [`${SANDBOX_PROJECT_ROOT}/a.html`]: '<a>',
      [`${SANDBOX_PROJECT_ROOT}/sub/b.css`]: 'b{}',
    });
  });

  it('extractDesignFiles round-trips seed files', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': '<h1>seed</h1>', 'app.css': '/* seed */' } });
    const files = await extractDesignFiles(bash);
    expect(files).toEqual({ 'index.html': '<h1>seed</h1>', 'app.css': '/* seed */' });
  });

  it('snapshotDesignFiles returns a Map mirroring extractDesignFiles', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'one.txt': '1' } });
    const snap = await snapshotDesignFiles(bash);
    expect(snap.get('one.txt')).toBe('1');
  });

  it('computeDesignFilesBeyondSeed returns full extracted map when seed is empty', () => {
    const out = computeDesignFilesBeyondSeed({ 'a.html': '<a>' }, undefined);
    expect(out).toEqual({ 'a.html': '<a>' });
  });

  it('computeDesignFilesBeyondSeed returns only added or changed files', () => {
    const seed = { 'unchanged.css': '/* same */', 'changed.html': '<old>' };
    const extracted = {
      'unchanged.css': '/* same */',
      'changed.html': '<new>',
      'added.js': 'console.log(1)',
    };
    expect(computeDesignFilesBeyondSeed(extracted, seed)).toEqual({
      'changed.html': '<new>',
      'added.js': 'console.log(1)',
    });
  });
});
