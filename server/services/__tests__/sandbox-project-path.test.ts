import { describe, expect, it } from 'vitest';
import { SANDBOX_PROJECT_ROOT, sandboxProjectAbsPath } from '../agent-bash-sandbox.ts';

describe('sandboxProjectAbsPath', () => {
  it('joins relative paths to the sandbox root', () => {
    expect(sandboxProjectAbsPath('src/index.html')).toBe(`${SANDBOX_PROJECT_ROOT}/src/index.html`);
  });

  it('strips leading slashes', () => {
    expect(sandboxProjectAbsPath('/foo/bar')).toBe(`${SANDBOX_PROJECT_ROOT}/foo/bar`);
  });
});
