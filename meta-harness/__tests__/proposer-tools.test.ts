import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  dispatchTool,
  resolveSafeRead,
  sanitizeProposerKey,
  type ProposerContext,
} from '../proposer-tools.ts';

function fakeCtx(mode: ProposerContext['mode']): ProposerContext {
  return {
    root: '/repo',
    metaHarnessDir: '/repo/meta-harness',
    skillsDir: '/repo/skills',
    testCasesDir: '/repo/meta-harness/test-cases',
    evalRunsBaseDir: '/repo/eval-runs',
    rubricWeightPatch: {},
    submitted: null,
    mode,
    skillsMutated: false,
  };
}

describe('proposer-tools', () => {
  it('sanitizeProposerKey strips unsafe chars and returns null when empty', () => {
    expect(sanitizeProposerKey('  foo/bar  ')).toBe('foobar');
    expect(sanitizeProposerKey('valid-key_09')).toBe('valid-key_09');
    expect(sanitizeProposerKey('')).toBeNull();
    expect(sanitizeProposerKey('!!!')).toBeNull();
  });

  it('resolveSafeRead allows paths under meta-harness', () => {
    const ctx = fakeCtx('design');
    expect(resolveSafeRead(ctx, 'meta-harness/history/x')).toBe(
      path.resolve('/repo/meta-harness/history/x'),
    );
  });

  it('resolveSafeRead rejects escape paths', () => {
    const ctx = fakeCtx('design');
    expect(resolveSafeRead(ctx, '/etc/passwd')).toBeNull();
  });

  it('dispatchTool allows write_skill in incubate mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-inc-write-'));
    const ctx: ProposerContext = {
      root,
      metaHarnessDir: path.join(root, 'meta-harness'),
      skillsDir: path.join(root, 'skills'),
      testCasesDir: path.join(root, 'meta-harness', 'test-cases'),
      evalRunsBaseDir: path.join(root, 'eval-runs'),
      rubricWeightPatch: {},
      submitted: null,
      mode: 'incubate',
      skillsMutated: false,
    };
    const out = await dispatchTool(ctx, 'write_skill', JSON.stringify({ key: 'k', content: '# x\n' }));
    expect(out).toMatch(/Wrote/);
    expect(ctx.skillsMutated).toBe(true);
  });

  it('dispatchTool allows write_skill in inputs mode but rejects set_rubric_weights', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-inp-write-'));
    const ctx: ProposerContext = {
      root,
      metaHarnessDir: path.join(root, 'meta-harness'),
      skillsDir: path.join(root, 'skills'),
      testCasesDir: path.join(root, 'meta-harness', 'test-cases'),
      evalRunsBaseDir: path.join(root, 'eval-runs'),
      rubricWeightPatch: {},
      submitted: null,
      mode: 'inputs',
      skillsMutated: false,
    };
    expect(
      await dispatchTool(ctx, 'write_skill', JSON.stringify({ key: 'inputs-gen-research-context', content: '# y\n' })),
    ).toMatch(/Wrote/);
    expect(
      await dispatchTool(ctx, 'set_rubric_weights', JSON.stringify({ design: 1 })),
    ).toMatch(/rubric weight/);
  });

  it('write_system_prompt preserves frontmatter and replaces body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-sys-prompt-'));
    const promptDir = path.join(root, 'prompts', 'designer-agentic-system');
    await mkdir(promptDir, { recursive: true });
    await writeFile(
      path.join(promptDir, 'PROMPT.md'),
      '---\nname: X\ntype: system-prompt\ndescription: D\n---\n\nOld body\n',
      'utf8',
    );
    const ctx: ProposerContext = {
      root,
      metaHarnessDir: path.join(root, 'meta-harness'),
      skillsDir: path.join(root, 'skills'),
      testCasesDir: path.join(root, 'meta-harness', 'test-cases'),
      evalRunsBaseDir: path.join(root, 'eval-runs'),
      rubricWeightPatch: {},
      submitted: null,
      mode: 'design',
      skillsMutated: false,
    };
    const out = await dispatchTool(
      ctx,
      'write_system_prompt',
      JSON.stringify({ body: 'New instructor body' }),
    );
    expect(out).toMatch(/Wrote body/);
    expect(ctx.skillsMutated).toBe(true);
    const raw = await readFile(path.join(promptDir, 'PROMPT.md'), 'utf8');
    expect(raw).toContain('name: X');
    expect(raw).toContain('New instructor body');
    expect(raw).not.toContain('Old body');
  });

  it('dispatchTool rejects invalid tool JSON args', async () => {
    const ctx = fakeCtx('design');
    const out = await dispatchTool(ctx, 'read_file', '{');
    expect(out).toMatch(/invalid JSON/);
  });

  it('dispatchTool rejects read_file args missing path', async () => {
    const ctx = fakeCtx('design');
    const out = await dispatchTool(ctx, 'read_file', '{}');
    expect(out).toMatch(/invalid arguments for read_file/);
  });

  it('dispatchTool write_skill rejects sanitized-empty key (path traversal chars)', async () => {
    const ctx = fakeCtx('design');
    const out = await dispatchTool(
      ctx,
      'write_skill',
      JSON.stringify({ key: '../../', content: '# x' }),
    );
    expect(out).toMatch(/invalid skill key/);
  });

  it('dispatchTool write_skill writes only under skillsDir', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-write-skill-'));
    const ctx: ProposerContext = {
      root,
      metaHarnessDir: path.join(root, 'meta-harness'),
      skillsDir: path.join(root, 'skills'),
      testCasesDir: path.join(root, 'meta-harness', 'test-cases'),
      evalRunsBaseDir: path.join(root, 'eval-runs'),
      rubricWeightPatch: {},
      submitted: null,
      mode: 'design',
      skillsMutated: false,
    };
    const out = await dispatchTool(
      ctx,
      'write_skill',
      JSON.stringify({ key: 'safe-pkg', content: '# hello\n' }),
    );
    expect(out).toMatch(/Wrote/);
    const skillMd = path.join(ctx.skillsDir, 'safe-pkg', 'SKILL.md');
    expect(await readFile(skillMd, 'utf8')).toBe('# hello\n');
    expect(path.relative(ctx.skillsDir, skillMd)).toBe(path.join('safe-pkg', 'SKILL.md'));
  });
});
