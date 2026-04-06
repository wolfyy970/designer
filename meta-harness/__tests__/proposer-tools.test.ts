import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
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
    promptOverrides: {},
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

  it('dispatchTool rejects skill writes in incubate mode', async () => {
    const ctx = fakeCtx('incubate');
    const out = await dispatchTool(ctx, 'write_skill', JSON.stringify({ key: 'k', content: 'x' }));
    expect(out).toMatch(/incubate mode/);
  });

  it('dispatchTool rejects skill/rubric-weight tools in inputs mode', async () => {
    const ctx = fakeCtx('inputs');
    expect(await dispatchTool(ctx, 'write_skill', JSON.stringify({ key: 'k', content: 'x' }))).toMatch(
      /inputs mode/,
    );
    expect(await dispatchTool(ctx, 'delete_skill', JSON.stringify({ key: 'k' }))).toMatch(
      /inputs mode/,
    );
    expect(
      await dispatchTool(ctx, 'set_rubric_weights', JSON.stringify({ design: 1 })),
    ).toMatch(/inputs mode/);
  });

  it('set_prompt_override rejects non-inputs keys in inputs mode', async () => {
    const ctx = fakeCtx('inputs');
    const out = await dispatchTool(
      ctx,
      'set_prompt_override',
      JSON.stringify({ key: 'hypotheses-generator-system', body: 'override' }),
    );
    expect(out).toMatch(/inputs mode only allows/);
  });

  it('set_prompt_override allows inputs-gen keys in inputs mode', async () => {
    const ctx = fakeCtx('inputs');
    const out = await dispatchTool(
      ctx,
      'set_prompt_override',
      JSON.stringify({ key: 'inputs-gen-research-context', body: 'new prompt body' }),
    );
    expect(out).toMatch(/Stored override/);
    expect(ctx.promptOverrides['inputs-gen-research-context']).toBe('new prompt body');
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
      promptOverrides: {},
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
