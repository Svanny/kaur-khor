import { defineConfig } from '@playwright/test';

if (process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

export default defineConfig({
  testDir: '../../tests/bench/scenarios',
  testMatch: '**/*.bench.ts',
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.KAUR_KHOR_BENCHMARK_PLAYWRIGHT_REPORT ?? 'bench-results/playwright-report.json' }],
  ],
  outputDir: process.env.KAUR_KHOR_BENCHMARK_PLAYWRIGHT_ARTIFACTS_DIR ?? 'bench-results/playwright-artifacts',
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
