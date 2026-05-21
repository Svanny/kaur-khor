import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rootDir = resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@icons': resolve(rootDir, 'src/icons'),
      '@': resolve(rootDir, 'src/renderer/src'),
      '@renderer': resolve(rootDir, 'src/renderer/src'),
      '@shared': resolve(rootDir, 'src/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [resolve(rootDir, 'src/renderer/src/test/setup.ts')],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/bench/**/*.test.ts',
      'tools/scripts/**/*.test.mjs',
    ],
  },
});
