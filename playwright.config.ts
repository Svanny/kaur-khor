import { defineConfig } from '@playwright/test';

const parsedWorkerCount = Number(process.env.KAUR_KHOR_E2E_WORKERS ?? 3);
const workerCount = Number.isFinite(parsedWorkerCount) ? Math.max(1, parsedWorkerCount) : 3;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: workerCount,
  reporter: [['list']],
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
