import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { DEFAULT_DEV_API_PORT, DEFAULT_DEV_CLIENT_PORT } from './server/dev-defaults.ts';

const rootDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {
  version?: string;
  /** Optional fallback when `.git` is missing and a fixed release timestamp is preferred */
  releasedAt?: string;
};

/**
 * Release timestamp for display.
 * Prefer HEAD committer time when `.git` is available; Vercel CLI uploads do not
 * include `.git`, so fall back to package metadata and finally the build time.
 */
function releasedAtIsoFromGitOrPkg(): string {
  try {
    const out = execSync('git log -1 --format=%cI', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch {
    // Not a git repo, git missing, or empty history
  }
  if (typeof pkg.releasedAt === 'string' && pkg.releasedAt.trim()) {
    return pkg.releasedAt;
  }
  return new Date().toISOString();
}

const releasedAtIso = releasedAtIsoFromGitOrPkg();

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, rootDir, '');
  const apiPort =
    (fileEnv.PORT ?? process.env.PORT ?? '').trim() || String(DEFAULT_DEV_API_PORT);
  const clientPort =
    (fileEnv.VITE_PORT ?? process.env.VITE_PORT ?? '').trim() || String(DEFAULT_DEV_CLIENT_PORT);
  const devApiPortForClient = mode === 'production' ? '' : apiPort;

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version ?? ''),
      'import.meta.env.VITE_APP_RELEASED_AT': JSON.stringify(releasedAtIso),
      'import.meta.env.VITE_DEV_API_PORT': JSON.stringify(devApiPortForClient),
    },
    test: {
      setupFiles: ['src/test/setup.ts'],
      // `.vendor` holds upstream Pi sources; their test suite expects optional packages we don't install.
      exclude: [
        'node_modules/**',
        '.vendor/**',
        // DS package has its own vitest config (jsdom env) — avoid double-running with wrong environment.
        'packages/design-system/**',
        // Pi-boundary package has its own vitest config; chained from the root `test` script.
        'packages/auto-designer-pi/**',
        // Optional Playwright browser stack; keep unit tests hermetic.
        '**/browser-playwright-evaluator.test.ts',
      ],
    },
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    resolve: {
      alias: {
        '@auto-designer/design-system': resolve(rootDir, 'packages/design-system'),
      },
    },
    server: {
      port: parseInt(clientPort, 10),
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      /** Streamdown pulls Mermaid (~800k min); that chunk is lazy-loaded from the variant timeline. */
      chunkSizeWarningLimit: 1024,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('mermaid')) return 'vendor-mermaid';
            if (id.includes('streamdown')) return 'vendor-streamdown';
            if (id.includes('@xyflow/react')) return 'react-flow';
            if (id.includes('react-router')) return 'router';
            if (id.includes('html2canvas')) return 'html2canvas';
          },
        },
      },
    },
  };
});
