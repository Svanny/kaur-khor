import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './bench/scenarios',
  testMatch: '**/*.bench.ts',
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'bench-results/playwright-report.json' }],
  ],
  outputDir: 'bench-results/playwright-artifacts',
  use: {
    trace: process.env.BANJI_BENCHMARK_TRACE === '1' ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
