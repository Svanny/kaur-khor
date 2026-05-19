import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kaur-khor/',
  build: {
    chunkSizeWarningLimit: 1200,
    outDir: 'out/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
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
      '@icons': resolve(__dirname, 'src/icons'),
      '@': resolve(__dirname, 'src/renderer/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    host: true,
  },
});
