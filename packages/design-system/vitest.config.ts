import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFilesAfterEnv: [resolve(__dirname, 'vitest.setup.ts')],
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
