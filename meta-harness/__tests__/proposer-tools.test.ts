import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { dispatchTool, resolveSafeRead, type ProposerContext } from '../proposer-tools.ts';

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

  it('dispatchTool rejects skill writes in compile mode', async () => {
    const ctx = fakeCtx('compile');
    const out = await dispatchTool(ctx, 'write_skill', JSON.stringify({ key: 'k', content: 'x' }));
    expect(out).toMatch(/compile mode/);
  });

  it('dispatchTool rejects invalid tool JSON args', async () => {
    const ctx = fakeCtx('design');
    const out = await dispatchTool(ctx, 'read_file', '{');
    expect(out).toMatch(/invalid JSON/);
  });
});
