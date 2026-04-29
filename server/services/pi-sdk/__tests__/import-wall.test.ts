import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const servicesDir = resolve(__dirname, '../../');

const TOOL_FILES = ['pi-bash-tool.ts', 'pi-app-tools.ts'];
const RUNTIME_CALLER_FILES = [
  'task-agent-session.ts',
  'agentic-orchestrator/pi-session-round.ts',
  'agentic-orchestrator/run.ts',
  'agentic-orchestrator/types.ts',
];
const PI_BOUNDARY_ALLOWED = new Set([
  'pi-agent-service.ts',
  'pi-agent-run-types.ts',
  'agent-runtime.ts',
]);

function serviceTypeScriptFiles(dir = servicesDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return serviceTypeScriptFiles(full);
    }
    if (!entry.name.endsWith('.ts')) return [];
    return [full.slice(servicesDir.length + 1)];
  });
}

/**
 * Tool adapters should depend on the app-owned virtual workspace contract,
 * not the concrete just-bash construction module. That keeps future runtime
 * swaps away from scattered raw VFS assumptions.
 */
describe('virtual workspace import wall', () => {
  for (const file of TOOL_FILES) {
    it(`${file} does not import directly from ../agent-bash-sandbox`, () => {
      const src = readFileSync(resolve(servicesDir, file), 'utf8');
      const direct = /from\s+['"]\.\/agent-bash-sandbox(?:\.ts)?['"]/.test(src);
      expect(
        direct,
        `${file} should import VFS primitives from './virtual-workspace.ts' instead of './agent-bash-sandbox.ts'.`,
      ).toBe(false);
    });
  }
});

describe('agent runtime import wall', () => {
  for (const file of RUNTIME_CALLER_FILES) {
    it(`${file} imports the app runtime facade`, () => {
      const src = readFileSync(resolve(servicesDir, file), 'utf8');
      expect(src).not.toMatch(/from\s+['"].*pi-agent-service(?:\.ts)?['"]/);
      expect(src).not.toMatch(/from\s+['"].*pi-agent-run-types(?:\.ts)?['"]/);
      expect(src).toMatch(/from\s+['"].*agent-runtime(?:\.ts)?['"]/);
    });
  }

  it('keeps Pi SDK imports inside the adapter boundary', () => {
    const files = [
      'agentic-orchestrator/pi-session-round.ts',
      'agentic-orchestrator/run.ts',
      'task-agent-session.ts',
      'task-agent-execution.ts',
      'generate-execution.ts',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(servicesDir, file), 'utf8');
      expect(src, `${file} must not import pi-sdk directly`).not.toMatch(/from\s+['"].*pi-sdk/);
    }
  });

  it('keeps raw Pi service imports limited to the runtime adapter layer', () => {
    for (const file of serviceTypeScriptFiles()) {
      if (PI_BOUNDARY_ALLOWED.has(file) || file.startsWith('pi-sdk/')) continue;
      const src = readFileSync(resolve(servicesDir, file), 'utf8');
      expect(src, `${file} should import agent-runtime instead of pi-agent-service`).not.toMatch(
        /from\s+['"].*pi-agent-service(?:\.ts)?['"]/,
      );
    }
  });
});
