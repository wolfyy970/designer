import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const servicesDir = resolve(__dirname, '../../');

const TOOL_FILES = ['pi-bash-tool.ts', 'pi-app-tools.ts'];

/**
 * The Pi SDK is the only place allowed to reach into `agent-bash-sandbox` on
 * behalf of the agent. Tool adapters must import sandbox primitives through
 * the SDK barrel so a future agent swap touches one module, not three.
 */
describe('pi-sdk import wall — VFS primitives flow through pi-sdk/', () => {
  for (const file of TOOL_FILES) {
    it(`${file} does not import directly from ../agent-bash-sandbox`, () => {
      const src = readFileSync(resolve(servicesDir, file), 'utf8');
      const direct = /from\s+['"]\.\/agent-bash-sandbox(?:\.ts)?['"]/.test(src);
      expect(
        direct,
        `${file} should import SANDBOX_PROJECT_ROOT / sandboxProjectAbsPath / snapshotDesignFiles via './pi-sdk/index.ts' instead of './agent-bash-sandbox.ts'. Re-export any new primitive from server/services/pi-sdk/index.ts.`,
      ).toBe(false);
    });
  }
});
