import { test } from '@playwright/test';
import {
  clickSidebarNavigation,
  closeBanjiBenchmarkApp,
  currentBenchmarkRoute,
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
  const currentRoute = await currentBenchmarkRoute(launched.page);
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  await clickSidebarNavigation(launched.page, 'Record update');
  const leaveDialog = launched.page.getByRole('dialog').filter({ hasText: 'Leave record update?' });
  if (await leaveDialog.isVisible().catch(() => false)) {
    await leaveDialog.getByRole('button', { name: 'Save draft and leave', exact: true }).click();
  }
  if (currentRoute !== '/record-update') {
    await waitForRecordUpdateReady(launched, previousCount);
  }
  await launched.page.getByText('Choose an update lane', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function openHubLane(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  lane: (typeof HUB_LANES)[number],
) {
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  const startedAt = Date.now();
  if (lane.actionLabel) {
    await launched.page.getByRole('button', { name: lane.cardLabel }).click();
  } else {
    await launched.page.getByRole('link', { name: lane.cardLabel }).click();
  }
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

async function openFirstWorkbenchTile(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  const tileVisual = launched.page.locator('[data-slot="workbench-tile-visual"]').first();
  await tileVisual.waitFor({ state: 'visible', timeout: 30_000 });
  await tileVisual.click();
}

async function completeReviewSaveFlow(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  {
    dashboardCount,
    metricName,
    reviewDialogTitle,
    reviewLabel,
    route,
  }: {
    dashboardCount: number;
    metricName: string;
    reviewDialogTitle: string;
    reviewLabel: string;
    route: `/${string}`;
  },
) {
  const startedAt = Date.now();
  await launched.page.getByRole('button', { name: reviewLabel, exact: true }).click();
  const reviewDialog = launched.page.getByRole('dialog', { name: reviewDialogTitle });
  await reviewDialog.waitFor({ state: 'visible', timeout: 30_000 });
  await reviewDialog.getByRole('button', { name: 'Confirm save', exact: true }).click();
  await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs: Date.now() - startedAt,
    route,
    category: 'interaction',
  });
}

async function benchmarkStockCountSave(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  await returnToRecordUpdateHub(launched);
  await openHubLane(launched, HUB_LANES[0]!);

  const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
  await openFirstWorkbenchTile(launched);
  const itemDialog = launched.page.getByRole('dialog').first();
  await itemDialog.getByLabel('Units in stock').fill('7');
  await itemDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await completeReviewSaveFlow(launched, {
    dashboardCount,
    metricName: 'interaction.save_stock_count_ms',
    reviewDialogTitle: 'Review update',
    reviewLabel: 'Review update',
    route: '/record-update/stock-count',
  });
}

async function benchmarkSupplierReceiptSave(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  await returnToRecordUpdateHub(launched);
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
  await launched.page.getByRole('button', { name: 'Supplier Order' }).click();
  const editButton = launched.page.getByRole('button', { name: 'Edit/Update', exact: true });
  if (await editButton.isEnabled().catch(() => false)) {
    await editButton.click();
    await launched.page.locator('[role="dialog"] button').filter({ hasText: /Siem Reap Rattan|browser-batch-1/i }).first().click();
  } else {
    await launched.page.getByRole('button', { name: 'New', exact: true }).click();
    const replaceDraftDialog = launched.page.getByRole('dialog').filter({ hasText: 'Delete saved draft?' });
    if (await replaceDraftDialog.isVisible().catch(() => false)) {
      await replaceDraftDialog.getByRole('button', { name: 'Delete draft and start new', exact: true }).click();
    }
  }
  await waitForRecordUpdateReady(launched, previousCount);

  const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
  await openFirstWorkbenchTile(launched);
  await launched.page.getByRole('dialog').first().getByRole('button', { name: 'Add line', exact: true }).click();
  await completeReviewSaveFlow(launched, {
    dashboardCount,
    metricName: 'interaction.save_supplier_order_receipt_ms',
    reviewDialogTitle: 'Confirm receipt',
    reviewLabel: 'Review receipt',
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
