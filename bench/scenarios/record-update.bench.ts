import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  navigateHashRoute,
  persistedBenchmarkEventCount,
  recordPlaywrightDuration,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

const LANES: Array<{ name: string; path: `/${string}` }> = [
  { name: 'stock-count', path: '/record-update/stock-count' },
  { name: 'customer-order-pending', path: '/record-update/customer-orders-pending' },
  { name: 'customer-order-completed', path: '/record-update/customer-orders-completed' },
  { name: 'supplier-order-pending', path: '/record-update/supplier-orders-pending' },
  { name: 'supplier-receipt', path: '/record-update/supplier-receipts' },
];

async function clickButtonTimes(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  name: string,
  times = 1,
) {
  for (let index = 0; index < times; index += 1) {
    await launched.page.getByRole('button', { name, exact: true }).click();
  }
}

async function completeSaveFlow(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  {
    dashboardCount,
    metricName,
    route,
  }: {
    dashboardCount: number;
    metricName: string;
    route: `/${string}`;
  },
) {
  const startedAt = Date.now();
  await clickButtonTimes(launched, 'Next');

  const saveButton = launched.page.getByRole('button', { name: 'Save update', exact: true });
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const nextDashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
    if (nextDashboardCount >= dashboardCount + 1) {
      await recordPlaywrightDuration(launched.page, {
        metricName,
        durationMs: Date.now() - startedAt,
        route,
        category: 'interaction',
      });
      return;
    }

    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click();
      await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
      await recordPlaywrightDuration(launched.page, {
        metricName,
        durationMs: Date.now() - startedAt,
        route,
        category: 'interaction',
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${metricName} to complete.`);
}

async function benchmarkStockCountSave(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
  const routeReadyCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  await navigateHashRoute(launched.page, '/record-update/stock-count');
  await waitForPersistedBenchmarkEventCount(launched, 'route.record-update.ready', routeReadyCount + 1);

  await clickButtonTimes(launched, 'Next', 2);
  await launched.page.getByLabel('Current Units').first().waitFor({ state: 'visible', timeout: 30_000 });
  await launched.page.getByLabel('Current Units').first().fill('7');
  await clickButtonTimes(launched, 'Next');
  await clickButtonTimes(launched, 'No', 2);
  await clickButtonTimes(launched, 'No');
  await completeSaveFlow(launched, {
    dashboardCount,
    metricName: 'interaction.save_stock_count_ms',
    route: '/record-update/stock-count',
  });
}

async function benchmarkSupplierReceiptSave(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
  const routeReadyCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  await navigateHashRoute(launched.page, '/record-update/supplier-receipts');
  await waitForPersistedBenchmarkEventCount(launched, 'route.record-update.ready', routeReadyCount + 1);

  await clickButtonTimes(launched, 'Next', 2);
  await launched.page.getByLabel('Received date').waitFor({ state: 'visible', timeout: 30_000 });
  await launched.page.getByLabel('Received date').fill('2026-04-11');
  await launched.page.getByLabel(/Current receipt for/i).first().fill('6');
  await clickButtonTimes(launched, 'Next');
  await clickButtonTimes(launched, 'No');
  await completeSaveFlow(launched, {
    dashboardCount,
    metricName: 'interaction.save_supplier_receipt_ms',
    route: '/record-update/supplier-receipts',
  });
}

test('record update lanes become interactive', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('record-update-lanes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    for (const lane of LANES) {
      const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
      const startedAt = Date.now();
      await navigateHashRoute(launched.page, lane.path);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.record-update.ready',
        previousCount + 1,
      );
      await recordPlaywrightDuration(launched.page, {
        metricName: lane.name === 'stock-count' ? 'interaction.open_record_update_ms' : 'nav.record_update_lane_switch_ms',
        durationMs: Date.now() - startedAt,
        route: lane.path,
        category: 'navigation',
      });
      await snapshotRendererBenchmarkMemory(
        launched.page,
        `memory.renderer_after_record_update_${lane.name.replace(/\W+/g, '_')}_mb`,
      );
    }

    await benchmarkStockCountSave(launched);
    await benchmarkSupplierReceiptSave(launched);
  } finally {
    await closeBanjiBenchmarkApp(launched, 'record-update');
  }
});
