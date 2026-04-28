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

test.describe('Insights timeframe dropdown', () => {
  test('eye icon in Custom timeframe opens dialog', async () => {
    await mkdir(ARTIFACTS_DIR, { recursive: true });

    const app = await electron.launch({
      executablePath: electronPath as string,
      args: ['.'],
      timeout: 120_000,
      env: {
        ...process.env,
        BANJI_BENCHMARK: '1',
        BANJI_BENCHMARK_BACKGROUND: '0',
        BANJI_BENCHMARK_DISABLE_DEV_SEED: '0',
        BANJI_DESKTOP_CORE_BINARY: DESKTOP_CORE_BINARY,
      },
    });

    let page;
    try {
      page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Navigate to insights performance (pressure) page
      await page.evaluate(() => {
        window.location.hash = '#/insights/pressure';
      });
      await page.waitForFunction(
        () => window.location.hash === '#/insights/pressure',
        undefined,
        { timeout: 10000 },
      );

      // Wait for the page to load content
      await page.waitForTimeout(2000);

      // Take screenshot before interaction
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'before-dropdown.png') });

      // Click the timeframe Select trigger to open dropdown
      const trigger = page.getByRole('combobox', { name: /Select performance time range/i });
      await trigger.waitFor({ state: 'visible', timeout: 10000 });
      await trigger.click();

      // Wait for dropdown content to appear
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'dropdown-open.png') });

      // Use keyboard to navigate to the last option (Custom)
      // Radix UI Select viewport is constrained to trigger height, so the
      // "Custom" option is off-screen; End key scrolls it into view.
      await page.keyboard.press('End');
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'dropdown-custom-visible.png') });

      // Find the "Custom" option's eye icon button
      const eyeButton = page.locator('button[aria-label="Open custom date range dialog"]').first();
      await eyeButton.waitFor({ state: 'visible', timeout: 5000 });
      await eyeButton.click();

      // Wait for dialog to appear
      await page.waitForTimeout(500);

      // Take screenshot showing dialog
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'after-eye-click.png') });

      // Verify dialog is visible
      const dialog = page.getByRole('dialog', { name: /Custom timeframe/i });
      await expect(dialog).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('eye icon works after custom timeframe is already set', async () => {
    await mkdir(ARTIFACTS_DIR, { recursive: true });

    const app = await electron.launch({
      executablePath: electronPath as string,
      args: ['.'],
      timeout: 120_000,
      env: {
        ...process.env,
        BANJI_BENCHMARK: '1',
        BANJI_BENCHMARK_BACKGROUND: '0',
        BANJI_BENCHMARK_DISABLE_DEV_SEED: '0',
        BANJI_DESKTOP_CORE_BINARY: DESKTOP_CORE_BINARY,
      },
    });

    let page;
    try {
      page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Navigate to insights performance (pressure) page
      await page.evaluate(() => {
        window.location.hash = '#/insights/pressure';
      });
      await page.waitForFunction(
        () => window.location.hash === '#/insights/pressure',
        undefined,
        { timeout: 10000 },
      );

      // Wait for the page to load content
      await page.waitForTimeout(2000);

      // 1. Open the timeframe dropdown
      const trigger = page.getByRole('combobox', { name: /Select performance time range/i });
      await trigger.waitFor({ state: 'visible', timeout: 10000 });
      await trigger.click();
      await page.waitForTimeout(500);

      // 2. Navigate to Custom and click the Custom option itself
      await page.keyboard.press('End');
      await page.waitForTimeout(300);
      const customOption = page.getByRole('option', { name: /Custom/i });
      await customOption.click();
      await page.waitForTimeout(500);

      // 3. Wait for dialog and fill in dates
      const dialog = page.getByRole('dialog', { name: /Custom timeframe/i });
      await expect(dialog).toBeVisible();

      await page.getByLabel(/Start date/i).fill('2024-01-01');
      await page.getByLabel(/End date/i).fill('2024-01-31');
      await page.waitForTimeout(300);

      // 4. Click Apply
      await page.getByRole('button', { name: /Apply/i }).click();

      // 5. Wait for dialog to close and URL to update
      await page.waitForFunction(
        () => window.location.hash.includes('range=custom'),
        undefined,
        { timeout: 10000 },
      );
      await page.waitForTimeout(2000);

      // Screenshot after custom range is applied
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'after-custom-set.png') });

      // 6. Open dropdown again and navigate to Custom
      await trigger.click();
      await page.waitForTimeout(500);
      await page.keyboard.press('End');
      await page.waitForTimeout(300);

      // Screenshot dropdown open after custom is set
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'dropdown-after-custom-set.png') });

      // 7. Click the eye icon button
      const eyeButton = page.locator('button[aria-label="Open custom date range dialog"]').first();
      await eyeButton.waitFor({ state: 'visible', timeout: 5000 });
      await eyeButton.click();
      await page.waitForTimeout(500);

      // Screenshot after eye click when custom is already active
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'after-eye-click-post-custom.png') });

      // 8. Assert dialog is visible again
      await expect(dialog).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
