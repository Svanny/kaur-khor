import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@icons': resolve(__dirname, 'src/icons'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@icons': resolve(__dirname, 'src/icons'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@icons': resolve(__dirname, 'src/icons'),
        '@': resolve(__dirname, 'src/renderer/src'),
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
    },
  },
});
