import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Vitest's option is `setupFiles`. This was `setupFilesAfterEnv`, which is
    // the Jest name — Vitest 4 ignores unknown keys, so `vitest.setup.ts` was
    // never actually loaded and jest-dom matchers were silently unavailable.
    // No current DS test uses them, so nothing was failing; this makes the
    // config honest (and lets `tsc --noEmit` pass on this package).
    setupFiles: [resolve(__dirname, 'vitest.setup.ts')],
    include: [
      resolve(__dirname, 'lib/__tests__/**/*.test.ts'),
      resolve(__dirname, 'components/ui/__tests__/**/*.test.{ts,tsx}'),
      resolve(__dirname, '__tests__/**/*.test.ts'),
    ],
  },
  resolve: {
    alias: {
      '@ds': __dirname,
    },
  },
});
