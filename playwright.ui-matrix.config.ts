import { defineConfig } from '@playwright/test';

const needsWebServer = process.env.KAUR_KHOR_UI_MATRIX_WEB === '1';
const webPort = Number(process.env.KAUR_KHOR_UI_MATRIX_WEB_PORT ?? 5176);
const webHost = process.env.KAUR_KHOR_UI_MATRIX_WEB_HOST ?? '127.0.0.1';

export default defineConfig({
  testDir: './ui-matrix/scenarios',
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'ui-matrix-results/playwright-artifacts',
  use: {
    baseURL: `http://${webHost}:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: needsWebServer
    ? {
        command: `pnpm exec vite --config vite.web.config.ts --host ${webHost} --port ${webPort}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: `http://${webHost}:${webPort}/kaur-khor/`,
      }
    : undefined,
});
