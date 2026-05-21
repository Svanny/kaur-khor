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

interface PageTestCase {
  name: string;
  hash: string;
}

const PAGES: PageTestCase[] = [
  { name: 'Home', hash: '#/' },
  { name: 'Work', hash: '#/work' },
  { name: 'Capture', hash: '#/work/capture' },
  { name: 'Insights', hash: '#/insights' },
];

test.describe('Grid card layout', () => {
  for (const pageCase of PAGES) {
    test(`${pageCase.name} page has no vertical scroll and grid is centered`, async () => {
      await mkdir(ARTIFACTS_DIR, { recursive: true });

      const app = await electron.launch({
        executablePath: electronPath as string,
        args: ['.'],
        timeout: 120_000,
        env: {
          ...process.env,
          KAUR_KHOR_BENCHMARK: '1',
          KAUR_KHOR_BENCHMARK_BACKGROUND: '0',
          KAUR_KHOR_BENCHMARK_DISABLE_DEV_SEED: '0',
          KAUR_KHOR_DESKTOP_CORE_BINARY: DESKTOP_CORE_BINARY,
        },
      });

      let page;
      try {
        page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, pageCase.hash);
        await page.waitForFunction(
          (hash) => window.location.hash === hash,
          pageCase.hash,
          { timeout: 10000 },
        );

        await page.waitForTimeout(2000);

        const hasNoVerticalScroll = await page.evaluate(() => {
          return document.documentElement.scrollHeight <= window.innerHeight;
        });
        expect(hasNoVerticalScroll, 'document should not have vertical scroll').toBe(true);

        const outerGrid = page.locator('[data-slot="centered-tile-grid"]').first();
        await outerGrid.waitFor({ state: 'visible', timeout: 10000 });

        const innerGrid = outerGrid.locator('[data-slot="centered-tile-grid-inner"]').first();
        await innerGrid.waitFor({ state: 'visible', timeout: 10000 });

        const outerBox = await outerGrid.boundingBox();
        const innerBox = await innerGrid.boundingBox();

        if (!outerBox) {
          throw new Error('Outer grid bounding box is null');
        }
        if (!innerBox) {
          throw new Error('Inner grid bounding box is null');
        }

        const gapAbove = innerBox.y - outerBox.y;
        const gapBelow = outerBox.y + outerBox.height - (innerBox.y + innerBox.height);
        const diff = Math.abs(gapAbove - gapBelow);

        expect(
          diff,
          `grid should be vertically centered within its container (gapAbove: ${gapAbove}px, gapBelow: ${gapBelow}px)`,
        ).toBeLessThanOrEqual(5);
      } finally {
        await app.close();
      }
    });
  }
});
