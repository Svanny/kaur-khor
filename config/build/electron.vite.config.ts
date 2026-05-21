import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = resolve(__dirname, '../..');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@icons': resolve(rootDir, 'src/icons'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@icons': resolve(rootDir, 'src/icons'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@icons': resolve(rootDir, 'src/icons'),
        '@': resolve(rootDir, 'src/renderer/src'),
        '@renderer': resolve(rootDir, 'src/renderer/src'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
    plugins: [react({ babel: { compact: false } }), tailwindcss()],
    server: {
      host: true,
    },
  },
});
