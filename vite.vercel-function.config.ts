import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server/vercel-entry.ts',
    outDir: 'api',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: '[[...route]].js',
        format: 'esm',
      },
    },
  },
});
