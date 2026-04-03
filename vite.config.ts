import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  test: {
    // `.vendor` holds upstream Pi sources; their test suite expects optional packages we don't install.
    exclude: [
      'node_modules/**',
      '.vendor/**',
      // Optional Playwright browser stack; keep unit tests hermetic.
      '**/browser-playwright-evaluator.test.ts',
    ],
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /** Same origin as `http://localhost:5173` so localStorage (active spec + canvas manager) stays stable. */
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
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
})
