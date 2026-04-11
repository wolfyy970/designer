/**
 * Vitest config to run the optional Playwright merge tests (excluded from default `pnpm test`
 * so the suite stays hermetic — see AGENTS.md).
 *
 * Standalone minimal config so `test.exclude` does not merge with `vite.config.ts`'s
 * glob that excludes the browser-playwright-evaluator test file.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['node_modules/**', '.vendor/**'],
  },
});
