import { existsSync, copyFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import electronExecutable from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const readmeDir = path.join(repoRoot, 'docs', 'readme');
const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js');

const screenshotRoutes = [
  { hash: '#/', file: 'overview-fullscreen.png' },
  { hash: '#/work/queue?workflow=supplier', file: 'queue-supplier-fullscreen.png' },
  { hash: '#/work/queue?workflow=customer', file: 'queue-customer-fullscreen.png' },
  { hash: '#/work/capture', file: 'record-update-fullscreen.png' },
  { hash: '#/work/capture/stock-count', file: 'stock-count-fullscreen.png' },
  { hash: '#/work/capture/customer-order', file: 'customer-order-fullscreen.png' },
  { hash: '#/insights/pressure', file: 'performance-fullscreen.png' },
  { hash: '#/insights/money', file: 'financials-fullscreen.png' },
  { hash: '#/catalog', file: 'catalog-fullscreen.png' },
  { hash: '#/insights/explain', file: 'analysis-fullscreen.png' },
];

const carouselCopies = {
  'web-current-overview.png': 'overview-fullscreen.png',
  'web-current-queue-supplier.png': 'queue-supplier-fullscreen.png',
  'web-current-queue-customer.png': 'queue-customer-fullscreen.png',
  'web-current-stock-count.png': 'stock-count-fullscreen.png',
  'web-current-customer-order.png': 'customer-order-fullscreen.png',
  'web-current-record-update.png': 'record-update-fullscreen.png',
  'web-current-performance.png': 'performance-fullscreen.png',
  'web-current-catalog.png': 'catalog-fullscreen.png',
  'web-current-analysis.png': 'analysis-fullscreen.png',
};

if (!existsSync(mainEntry)) {
  throw new Error('Missing out/main/index.js. Run `pnpm build` before capturing README screenshots.');
}

await mkdir(readmeDir, { recursive: true });

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [mainEntry],
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '0',
    KAUR_KHOR_DISABLE_CLOSE_CONFIRM: '1',
  },
});

try {
  const page = await app.firstWindow({ timeout: 30_000 });
  await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1728, 996);
    window.setPosition(0, 0);
    window.showInactive();
  });
  await page.waitForLoadState('domcontentloaded');

  async function waitForWorkspace() {
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes('Loading local workspace') &&
        !document.body.innerText.includes('Loading preferences'),
      null,
      { timeout: 30_000 },
    ).catch(() => {});
    await page.waitForTimeout(4_000);
  }

  async function expandSidebarTree() {
    for (let pass = 0; pass < 4; pass += 1) {
      const collapsed = page.locator('[data-sidebar=sidebar] button[aria-expanded="false"]');
      const count = await collapsed.count().catch(() => 0);
      if (count === 0) {
        break;
      }
      for (let index = 0; index < count; index += 1) {
        const button = collapsed.nth(0);
        if (await button.isVisible().catch(() => false)) {
          await button.click().catch(() => {});
        }
      }
      await page.waitForTimeout(250);
    }
  }

  async function prepareRouteForScreenshot(route) {
    if (route.hash !== '#/work/capture/customer-order') {
      return;
    }
    const newButton = page.getByRole('button', { name: 'New' });
    if (await newButton.isVisible().catch(() => false)) {
      await newButton.click();
      await page.waitForTimeout(1_000);
    }
  }

  for (const route of screenshotRoutes) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, route.hash);
    await waitForWorkspace();
    await expandSidebarTree();
    await prepareRouteForScreenshot(route);
    await page.waitForTimeout(1_000);
    await page.screenshot({
      fullPage: false,
      path: path.join(readmeDir, route.file),
    });
    console.log(`${route.file} ${route.hash}`);
  }

  for (const [destination, source] of Object.entries(carouselCopies)) {
    copyFileSync(path.join(readmeDir, source), path.join(readmeDir, destination));
    console.log(`${destination} <- ${source}`);
  }
} finally {
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
}
