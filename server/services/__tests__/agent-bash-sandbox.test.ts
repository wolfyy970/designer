import { describe, it, expect } from 'vitest';
import {
  buildSandboxSeedMaps,
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from '../agent-bash-sandbox.ts';

describe('agent-bash-sandbox', () => {
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
});
