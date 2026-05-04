import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ARTIFACTS_DIR = join(process.cwd(), 'e2e-results');
const DESKTOP_CORE_BINARY = resolve(
  process.cwd(),
  'apps/desktop-core/target/debug',
  process.platform === 'win32' ? 'kaur-khor-desktop-core.exe' : 'kaur-khor-desktop-core',
);

async function launchApp(dataDir?: string) {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    KAUR_KHOR_BENCHMARK: '1',
    KAUR_KHOR_BENCHMARK_BACKGROUND: '0',
    KAUR_KHOR_BENCHMARK_DISABLE_DEV_SEED: '0',
    KAUR_KHOR_DESKTOP_CORE_BINARY: DESKTOP_CORE_BINARY,
  };
  if (dataDir) {
    env.KAUR_KHOR_BENCHMARK_DATA_DIR = dataDir;
  }
  return electron.launch({
    executablePath: electronPath as string,
    args: ['.'],
    timeout: 120_000,
    env,
  });
}

test.describe('Interface view preset cards', () => {
  test('Settings page presets are centered in a 1x4 layout at intermediate desktop width', async ({}, testInfo) => {
    await mkdir(testInfo.outputDir, { recursive: true });
    const app = await launchApp(testInfo.outputDir);
    try {
      const page = await app.firstWindow();
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.waitForLoadState('domcontentloaded');

      // Skip onboarding so we can reach Settings
      await page.evaluate(async () => {
        await (window as any).kaurKhorDesktop?.preferences?.save({ onboardingCompletedAt: new Date().toISOString() });
      });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await page.evaluate(() => {
        window.location.hash = '#/settings/interface';
      });
      await page.waitForFunction(() => window.location.hash === '#/settings/interface', { timeout: 10000 });
      await page.waitForTimeout(2000);

      const grid = page.locator('[role="radiogroup"][aria-label="Display view mode"]').first();
      await grid.waitFor({ state: 'visible', timeout: 10000 });

      const screenshotPath = join(ARTIFACTS_DIR, `${testInfo.title.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath });

      const styles = await grid.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          justifyContent: computed.justifyContent,
          gridTemplateColumns: computed.gridTemplateColumns,
        };
      });

      const trackCount = styles.gridTemplateColumns.trim().split(/\s+/).length;

      expect(styles.justifyContent, 'grid should be horizontally centered').toBe('center');
      expect(trackCount, 'grid should have 4 columns at this viewport').toBe(4);
    } finally {
      await app.close();
    }
  });

  test('Settings page presets are centered in a 1x1 layout at small viewport', async ({}, testInfo) => {
    await mkdir(testInfo.outputDir, { recursive: true });
    const app = await launchApp(testInfo.outputDir);
    try {
      const page = await app.firstWindow();
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForLoadState('domcontentloaded');

      // Skip onboarding so we can reach Settings
      await page.evaluate(async () => {
        await (window as any).kaurKhorDesktop?.preferences?.save({ onboardingCompletedAt: new Date().toISOString() });
      });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await page.evaluate(() => {
        window.location.hash = '#/settings/interface';
      });
      await page.waitForFunction(() => window.location.hash === '#/settings/interface', { timeout: 10000 });
      await page.waitForTimeout(2000);

      const grid = page.locator('[role="radiogroup"][aria-label="Display view mode"]').first();
      await grid.waitFor({ state: 'visible', timeout: 10000 });

      const screenshotPath = join(ARTIFACTS_DIR, `${testInfo.title.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath });

      const styles = await grid.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          justifyContent: computed.justifyContent,
          gridTemplateColumns: computed.gridTemplateColumns,
        };
      });

      const trackCount = styles.gridTemplateColumns.trim().split(/\s+/).length;

      expect(styles.justifyContent, 'grid should be horizontally centered').toBe('center');
      expect(trackCount, 'grid should have 1 column at this viewport').toBe(1);
    } finally {
      await app.close();
    }
  });

  test('Onboarding page presets are centered in a 1x3 layout', async ({}, testInfo) => {
    await mkdir(testInfo.outputDir, { recursive: true });
    const app = await launchApp(testInfo.outputDir);
    try {
      const page = await app.firstWindow();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForLoadState('domcontentloaded');

      // Prevent dev-seed from redirecting away from onboarding by forcing it incomplete
      await page.evaluate(async () => {
        await (window as any).kaurKhorDesktop?.preferences?.save({ onboardingCompletedAt: null });
      });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Click Continue to reach the interface step.
      const continueButton = page.locator('button[type="button"]').last();
      await continueButton.waitFor({ state: 'visible', timeout: 10000 });
      await continueButton.click();
      await page.waitForTimeout(2000);

      const grid = page.locator('[role="radiogroup"][aria-label="Display view mode"]').first();
      await grid.waitFor({ state: 'visible', timeout: 10000 });

      const screenshotPath = join(ARTIFACTS_DIR, `${testInfo.title.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath });

      const styles = await grid.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          justifyContent: computed.justifyContent,
          gridTemplateColumns: computed.gridTemplateColumns,
        };
      });

      const trackCount = styles.gridTemplateColumns.trim().split(/\s+/).length;

      expect(styles.justifyContent, 'grid should be horizontally centered').toBe('center');
      expect(trackCount, 'grid should have 3 columns at this viewport').toBe(3);
    } finally {
      await app.close();
    }
  });
});
