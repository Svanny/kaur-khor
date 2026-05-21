import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const needsWebServer = process.env.KAUR_KHOR_UI_MATRIX_WEB === '1';
const webPort = Number(process.env.KAUR_KHOR_UI_MATRIX_WEB_PORT ?? 5176);
const webHost = process.env.KAUR_KHOR_UI_MATRIX_WEB_HOST ?? '127.0.0.1';
const parsedWorkerCount = Number.parseInt(process.env.KAUR_KHOR_UI_MATRIX_WORKERS ?? '3', 10);
const workerCount = Number.isFinite(parsedWorkerCount) ? Math.max(1, parsedWorkerCount) : 3;
const rootDir = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const webConfigPath = resolve(rootDir, 'config/build/vite.web.config.ts');

export default defineConfig({
  testDir: '../../tests/ui-matrix/scenarios',
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: workerCount,
  reporter: [['list']],
  outputDir: '../../ui-matrix-results/playwright-artifacts',
  use: {
    baseURL: `http://${webHost}:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: needsWebServer
    ? {
        command: `pnpm --dir ${rootDir} exec vite --config ${webConfigPath} --host ${webHost} --port ${webPort}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: `http://${webHost}:${webPort}/kaur-khor/`,
      }
    : undefined,
});
