import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ARTIFACTS_DIR = join(process.cwd(), 'e2e-results');
const DESKTOP_CORE_BINARY = resolve(
  process.cwd(),
  'apps/desktop-core/target/debug',
  process.platform === 'win32' ? 'banji-desktop-core.exe' : 'banji-desktop-core',
);

async function launchApp(dataDir?: string) {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    BANJI_BENCHMARK: '1',
    BANJI_BENCHMARK_BACKGROUND: '0',
    BANJI_BENCHMARK_DISABLE_DEV_SEED: '1',
    BANJI_DESKTOP_CORE_BINARY: DESKTOP_CORE_BINARY,
  };
  if (dataDir) {
    env.BANJI_BENCHMARK_DATA_DIR = dataDir;
  }
  return electron.launch({
    executablePath: electronPath as string,
    args: ['.'],
    timeout: 120_000,
    env,
  });
}

test.describe('CenteredTileGrid 1x1 centering', () => {
  test('single tile is vertically centered even when it overflows the flex area', async ({}, testInfo) => {
    await mkdir(testInfo.outputDir, { recursive: true });
    const app = await launchApp(testInfo.outputDir);
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Ensure onboarding is complete so we land on the app
      await page.evaluate(async () => {
        await (window as any).banjiDesktop?.preferences?.save({ onboardingCompletedAt: new Date().toISOString() });
      });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Navigate to home page where only Start Work is visible in empty workspace
      await page.evaluate(() => {
        window.location.hash = '#/';
      });
      await page.waitForFunction(() => window.location.hash === '#/', { timeout: 10000 });
      await page.setViewportSize({ width: 450, height: 800 });
      await page.waitForTimeout(2000);

      const outerGrid = page.locator('.grid.min-h-0.flex-1.place-items-center').first();
      await outerGrid.waitFor({ state: 'visible', timeout: 10000 });

      // Force the grid area to be smaller than the tile so we exercise overflow centering
      await outerGrid.evaluate((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.flex = 'none';
        htmlEl.style.height = '120px';
      });
      await page.waitForTimeout(500);

      const innerGrid = outerGrid.locator('> div').first();
      await innerGrid.waitFor({ state: 'visible', timeout: 10000 });

      const tile = innerGrid.locator('.liquid-grid-card-frame').first();
      await tile.waitFor({ state: 'visible', timeout: 10000 });
      await tile.evaluate((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.width = '200px';
        htmlEl.style.height = '200px';
      });
      await page.waitForTimeout(500);

      const screenshotPath = join(ARTIFACTS_DIR, `${testInfo.title.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: screenshotPath });

      const outerBox = await outerGrid.boundingBox();
      const tileBox = await tile.boundingBox();

      if (!outerBox || !tileBox) {
        throw new Error('Bounding box is null');
      }

      const gapAbove = tileBox.y - outerBox.y;
      const gapBelow = outerBox.y + outerBox.height - (tileBox.y + tileBox.height);
      const diff = Math.abs(gapAbove - gapBelow);

      expect(
        diff,
        `tile should be vertically centered within its container (gapAbove: ${gapAbove}px, gapBelow: ${gapBelow}px)`,
      ).toBeLessThanOrEqual(10);
    } finally {
      await app.close();
    }
  });
});
