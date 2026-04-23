import { test } from '@playwright/test';
import {
  clickSidebarNavigation,
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  persistedBenchmarkEventCount,
  recordPlaywrightDuration,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

const HUB_LANES: Array<{
  actionLabel?: 'New';
  cardLabel: string;
  metricName?: string;
  name: string;
  path: `/${string}`;
}> = [
  {
    cardLabel: 'Stock Count',
    metricName: 'interaction.open_record_update_ms',
    name: 'stock-count',
    path: '/record-update/stock-count',
  },
  {
    actionLabel: 'New',
    cardLabel: 'Supplier Order',
    metricName: 'nav.record_update_hub_to_lane_ms',
    name: 'supplier-order',
    path: '/record-update/supplier-orders-pending?ticketMode=new',
  },
  {
    actionLabel: 'New',
    cardLabel: 'Immediate Sale',
    metricName: 'nav.record_update_hub_to_lane_ms',
    name: 'immediate-sale',
    path: '/record-update/customer-orders-completed?ticketMode=new',
  },
  {
    actionLabel: 'New',
    cardLabel: 'Customer Order',
    metricName: 'nav.record_update_hub_to_lane_ms',
    name: 'customer-order',
    path: '/record-update/customer-orders-pending?ticketMode=new',
  },
];

async function waitForRecordUpdateReady(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  previousCount?: number,
) {
  const count = previousCount ?? await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  await waitForPersistedBenchmarkEventCount(launched, 'route.record-update.ready', count + 1);
}

async function returnToRecordUpdateHub(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  await clickSidebarNavigation(launched.page, 'Record update');
  await waitForRecordUpdateReady(launched);
  await launched.page.getByRole('heading', { name: 'Choose an update lane' }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function openHubLane(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  lane: (typeof HUB_LANES)[number],
) {
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  const startedAt = Date.now();
  await launched.page.getByRole('button', { name: lane.cardLabel }).click().catch(async () => {
    await launched.page.getByRole('link', { name: lane.cardLabel }).click();
  });
  if (lane.actionLabel) {
    await launched.page.getByRole('button', { name: lane.actionLabel, exact: true }).click();
  }
  await waitForRecordUpdateReady(launched, previousCount);
  if (lane.metricName) {
    await recordPlaywrightDuration(launched.page, {
      metricName: lane.metricName,
      durationMs: Date.now() - startedAt,
      route: lane.path,
      category: 'navigation',
    });
  }
  await snapshotRendererBenchmarkMemory(
    launched.page,
    `memory.renderer_after_record_update_${lane.name.replace(/\W+/g, '_')}_mb`,
  );
}

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
  await returnToRecordUpdateHub(launched);
  await openHubLane(launched, HUB_LANES[0]!);

  const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
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
  await returnToRecordUpdateHub(launched);
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  await launched.page.getByRole('button', { name: 'Supplier Order' }).click();
  await launched.page.getByRole('button', { name: 'Edit/Update', exact: true }).click();
  await launched.page.locator('[role="dialog"] button').filter({ hasText: /Siem Reap Rattan|browser-batch-1/i }).first().click();
  await waitForRecordUpdateReady(launched, previousCount);

  const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
  await clickButtonTimes(launched, 'Next', 2);
  await launched.page.getByLabel('Received date').waitFor({ state: 'visible', timeout: 30_000 });
  await launched.page.getByLabel('Received date').fill('2026-04-11');
  await launched.page.getByLabel(/Current receipt for/i).first().fill('6');
  await clickButtonTimes(launched, 'Next');
  await clickButtonTimes(launched, 'No');
  await completeSaveFlow(launched, {
    dashboardCount,
    metricName: 'interaction.save_supplier_order_receipt_ms',
    route: '/record-update/supplier-orders-pending',
  });
}

test('record update hub opens current lanes and saves current flows', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('record-update-hub-current-flows', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await returnToRecordUpdateHub(launched);

    for (const lane of HUB_LANES) {
      await openHubLane(launched, lane);
      await returnToRecordUpdateHub(launched);
    }

    await benchmarkStockCountSave(launched);
    await benchmarkSupplierReceiptSave(launched);
  } finally {
    await closeBanjiBenchmarkApp(launched, 'record-update');
  }
});
