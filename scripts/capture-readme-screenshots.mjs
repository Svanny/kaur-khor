import { execFile } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import electronPath from 'electron';
import { _electron as electron } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = join(repoRoot, 'docs/readme');
const viewport = { width: 1728, height: 996 };
const finalPixelSize = { width: 3456, height: 1984 };
const execFileAsync = promisify(execFile);

const captures = [
  { route: '/', file: 'overview-fullscreen.png', ready: 'route.home.ready', waitForText: 'Work queue' },
  { route: '/work/queue?workflow=supplier', file: 'queue-supplier-fullscreen.png', ready: 'route.work.queue.ready', waitForText: 'Supplier queue' },
  { route: '/work/queue?workflow=customer', file: 'queue-customer-fullscreen.png', ready: 'route.work.queue.ready', waitForText: 'Customer queue' },
  { route: '/work/capture', file: 'record-update-fullscreen.png', ready: 'route.work.capture.ready', waitForText: 'Stock Count' },
  { route: '/work/capture/stock-count', file: 'stock-count-fullscreen.png', ready: 'route.work.capture.ready', waitForText: 'Stock Count' },
  {
    route: '/work/capture/customer-order',
    file: 'customer-order-fullscreen.png',
    ready: 'route.work.capture.ready',
    waitForText: 'Customer Order',
    prepare: async (page) => {
      const newButton = page.getByRole('button', { name: 'New' });
      if (await newButton.isVisible().catch(() => false)) {
        await newButton.click();
        await page.waitForTimeout(1_000);
      }
    },
  },
  { route: '/insights/pressure', file: 'performance-fullscreen.png', ready: 'route.insights.pressure.ready', waitForText: 'Pressure' },
  { route: '/insights/money', file: 'financials-fullscreen.png', ready: 'route.insights.money.ready', waitForText: 'Financials' },
  { route: '/catalog', file: 'catalog-fullscreen.png', ready: 'route.catalog.ready', waitForText: 'Products' },
  { route: '/insights/explain', file: 'analysis-fullscreen.png', ready: 'route.insights.explain.ready', waitForText: 'Explain' },
];

const webCopies = new Map([
  ['overview-fullscreen.png', 'web-current-overview.png'],
  ['queue-supplier-fullscreen.png', 'web-current-queue-supplier.png'],
  ['queue-customer-fullscreen.png', 'web-current-queue-customer.png'],
  ['stock-count-fullscreen.png', 'web-current-stock-count.png'],
  ['customer-order-fullscreen.png', 'web-current-customer-order.png'],
  ['record-update-fullscreen.png', 'web-current-record-update.png'],
  ['performance-fullscreen.png', 'web-current-performance.png'],
  ['catalog-fullscreen.png', 'web-current-catalog.png'],
  ['analysis-fullscreen.png', 'web-current-analysis.png'],
]);

function childEnv(extra = {}) {
  const inheritedKeys = ['HOME', 'LANG', 'LC_ALL', 'LOGNAME', 'PATH', 'SHELL', 'TMPDIR', 'USER', 'XPC_FLAGS', 'XPC_SERVICE_NAME'];
  const inheritedEnv = Object.fromEntries(
    inheritedKeys.map((key) => [key, process.env[key]]).filter((entry) => typeof entry[1] === 'string'),
  );

  return { ...inheritedEnv, ...extra };
}

async function routeEventCount(page, name) {
  return page.evaluate((eventName) => {
    const events = globalThis.__KAUR_KHOR_BENCHMARK_EVENTS__ ?? [];
    return events.filter((event) => event?.name === eventName).length;
  }, name);
}

async function waitForRouteReady(page, name, minimumCount) {
  await page.waitForFunction(
    ({ eventName, nextCount }) => {
      const events = globalThis.__KAUR_KHOR_BENCHMARK_EVENTS__ ?? [];
      return events.filter((event) => event?.name === eventName).length >= nextCount;
    },
    { eventName: name, nextCount: minimumCount },
    { timeout: 60_000 },
  );
}

async function navigate(page, route, readyEvent) {
  const currentRoute = await page.evaluate(() => globalThis.location.hash.slice(1) || '/');
  if (currentRoute === route) {
    return;
  }

  const previousCount = await routeEventCount(page, readyEvent);
  await page.evaluate((nextRoute) => {
    globalThis.location.hash = `#${nextRoute}`;
  }, route);
  await page.waitForFunction((expectedRoute) => globalThis.location.hash.slice(1) === expectedRoute, route, { timeout: 30_000 });
  await waitForRouteReady(page, readyEvent, previousCount + 1).catch(() => undefined);
}

async function settle(page, waitForText) {
  await page.getByText(waitForText).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(900);
}

async function resizeToFinalSize(filePath) {
  await execFileAsync('sips', ['-z', String(finalPixelSize.height), String(finalPixelSize.width), filePath]);
}

async function expandSidebarTree(page) {
  for (let pass = 0; pass < 4; pass += 1) {
    const collapsed = page.locator('[data-sidebar=sidebar] button[aria-expanded="false"]');
    const count = await collapsed.count().catch(() => 0);
    if (count === 0) {
      break;
    }
    for (let index = 0; index < count; index += 1) {
      const button = collapsed.nth(0);
      if (await button.isVisible().catch(() => false)) {
        await button.click().catch(() => undefined);
      }
    }
    await page.waitForTimeout(250);
  }
}

const app = await electron.launch({
  executablePath: electronPath,
  args: [repoRoot],
  timeout: 120_000,
  env: childEnv({
    KAUR_KHOR_BENCHMARK: '1',
    KAUR_KHOR_BENCHMARK_TRACE: '0',
    KAUR_KHOR_BENCHMARK_BACKGROUND: '1',
    KAUR_KHOR_BENCHMARK_RUN_ID: 'readme-screenshot-refresh',
    KAUR_KHOR_BENCHMARK_OUTPUT_DIR: join(repoRoot, '.kaur-khor-dev-data/readme-screenshot-bench'),
    KAUR_KHOR_BENCHMARK_DATA_DIR: join(repoRoot, '.kaur-khor-dev-data'),
    KAUR_KHOR_DESKTOP_TRACE_IPC: '1',
    KAUR_KHOR_DISABLE_CLOSE_CONFIRM: '1',
  }),
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize(viewport);
  await page.waitForLoadState('domcontentloaded');
  await waitForRouteReady(page, 'renderer.workspace.ready', 1);

  for (const capture of captures) {
    await navigate(page, capture.route, capture.ready);
    await settle(page, capture.waitForText);
    await expandSidebarTree(page);
    if (capture.prepare) {
      await capture.prepare(page);
    }

    const filePath = join(screenshotDir, capture.file);
    await mkdir(dirname(filePath), { recursive: true });
    await page.screenshot({ path: filePath, animations: 'disabled' });
    await resizeToFinalSize(filePath);

    const copyName = webCopies.get(capture.file);
    if (copyName) {
      await cp(filePath, join(screenshotDir, copyName));
    }

    console.log(`${capture.route} -> ${capture.file}${copyName ? `, ${copyName}` : ''}`);
  }
} finally {
  await app.close().catch(() => undefined);
}
