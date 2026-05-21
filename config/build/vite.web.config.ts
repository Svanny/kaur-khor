import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = resolve(__dirname, '../..');

export default defineConfig({
  base: '/kaur-khor/',
  build: {
    // Temporary while the hardened OPFS, SQLite worker, and embedded shell chunks continue being split.
    chunkSizeWarningLimit: 1200,
    outDir: resolve(rootDir, 'out/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(rootDir, 'index.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  preview: {
    host: true,
  },
  plugins: [react({ babel: { compact: false } }), tailwindcss()],
  resolve: {
    alias: {
      '@icons': resolve(rootDir, 'src/icons'),
      '@': resolve(rootDir, 'src/renderer/src'),
      '@renderer': resolve(rootDir, 'src/renderer/src'),
      '@shared': resolve(rootDir, 'src/shared'),
    },
  },
  server: {
    host: true,
  },
});
