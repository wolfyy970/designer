import { describe, it, expect } from 'vitest';
import {
  buildSandboxSeedMaps,
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from '../agent-bash-sandbox.ts';

describe('agent-bash-sandbox', () => {
  it('seeds skills under project skills/', () => {
    const files = buildSandboxSeedMaps({
      virtualSkillFiles: { 'x/SKILL.md': 'skill' },
      seedFiles: { 'index.html': '<html></html>' },
    });
    expect(files[`${SANDBOX_PROJECT_ROOT}/skills/x/SKILL.md`]).toBe('skill');
    expect(files[`${SANDBOX_PROJECT_ROOT}/index.html`]).toBe('<html></html>');
  });

  it('extractDesignFiles omits skills subtree', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'app.js': 'x' },
      virtualSkillFiles: { 's/SKILL.md': 'ro' },
    });
    const map = await extractDesignFiles(bash);
    expect(map['app.js']).toBe('x');
    expect(Object.keys(map).some((k) => k.includes('skills'))).toBe(false);
  });
});
