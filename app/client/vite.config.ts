import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the big shared vendors into their own long-lived chunks so a
        // code change does not bust their cache, and they are not duplicated
        // across the lazy route chunks. The markdown stack rides into the lazy
        // DocsPage chunk on its own; highlight.js is dynamically imported.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Allow Vite's dev-mode file server to read markdown from the app/docs/
    // folder (one level above this client/ root). Without
    // this, import.meta.glob('../../docs/**/*.md') 503s in dev. Build is
    // unaffected — the glob is statically resolved at build time and the
    // contents get inlined into the bundle.
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
