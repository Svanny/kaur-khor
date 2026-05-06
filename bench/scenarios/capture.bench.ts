import { test } from '@playwright/test';
import {
  closeKaurKhorBenchmarkApp,
  currentBenchmarkRoute,
  launchKaurKhorForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
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
    metricName: 'interaction.open_capture_ms',
    name: 'stock-count',
    path: '/work/capture/stock-count',
  },
  {
    actionLabel: 'New',
    cardLabel: 'Supplier Order',
    metricName: 'nav.capture_hub_to_lane_ms',
    name: 'supplier-order',
    path: '/work/capture/supplier-order?ticketMode=new',
  },
  {
    actionLabel: 'New',
    cardLabel: 'Immediate Sale',
    metricName: 'nav.capture_hub_to_lane_ms',
    name: 'immediate-sale',
    path: '/work/capture/immediate-sale?ticketMode=new',
  },
  {
    actionLabel: 'New',
    cardLabel: 'Customer Order',
    metricName: 'nav.capture_hub_to_lane_ms',
    name: 'customer-order',
    path: '/work/capture/customer-order?ticketMode=new',
  },
];

async function waitForRecordUpdateReady(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
  previousCount?: number,
) {
  const count = previousCount ?? await persistedBenchmarkEventCount(launched, 'route.work.capture.ready');
  await waitForPersistedBenchmarkEventCount(launched, 'route.work.capture.ready', count + 1);
}

async function returnToRecordUpdateHub(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
) {
  const currentRoute = await currentBenchmarkRoute(launched.page);
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.work.capture.ready');
  if (currentRoute !== '/work/capture') {
    const startedAt = Date.now();
    await launched.page.evaluate(() => {
      window.location.hash = '#/work/capture';
    });
    const leaveDialog = launched.page.getByRole('dialog').filter({ hasText: /Leave (capture|record update)\?/i });
    if (await leaveDialog.isVisible().catch(() => false)) {
      await leaveDialog.getByRole('button', { name: 'Save draft and leave', exact: true }).click();
    }
    await launched.page.waitForFunction(() => window.location.hash.slice(1) === '/work/capture');
    await waitForRecordUpdateReady(launched, previousCount);
    await recordPlaywrightDuration(launched.page, {
      metricName: 'nav.work_queue_to_capture_ms',
      durationMs: Date.now() - startedAt,
      route: '/work/capture',
      category: 'navigation',
    });
  }
  await launched.page.getByRole('link', { name: 'Stock Count' }).waitFor({ state: 'visible', timeout: 30_000 });
  await launched.page.getByRole('button', { name: 'Supplier Order' }).waitFor({ state: 'visible', timeout: 30_000 });
}

async function openHubLane(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
  lane: (typeof HUB_LANES)[number],
) {
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.work.capture.ready');
  const startedAt = Date.now();
  if (lane.actionLabel) {
    await launched.page.getByRole('button', { name: lane.cardLabel }).click();
  } else {
    await launched.page.getByRole('link', { name: lane.cardLabel }).click();
  }
  if (lane.actionLabel) {
    const actionButton = launched.page.getByRole('button', { name: lane.actionLabel, exact: true });
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click();
    }
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
    `memory.renderer_after_capture_${lane.name.replace(/\W+/g, '_')}_mb`,
  );
}

async function openFirstWorkbenchTile(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
) {
  const tileVisual = launched.page.locator('[data-slot="workbench-tile-visual"]').first();
  await tileVisual.waitFor({ state: 'visible', timeout: 30_000 });
  await tileVisual.click();
}

async function completeReviewSaveFlow(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
  {
    metricName,
    reviewDialogTitle,
    reviewLabel,
    route,
  }: {
    metricName: string;
    reviewDialogTitle: string;
    reviewLabel: string;
    route: `/${string}`;
  },
) {
  const startedAt = Date.now();
  await launched.page.getByRole('button', { name: reviewLabel, exact: true }).first().click();
  const reviewDialog = launched.page.getByRole('dialog', { name: reviewDialogTitle });
  await reviewDialog.waitFor({ state: 'visible', timeout: 30_000 });
  await reviewDialog.getByRole('button', { name: 'Confirm save', exact: true }).click();
  await reviewDialog.waitFor({ state: 'hidden', timeout: 30_000 });
  await launched.page.waitForFunction(() => {
    const route = window.location.hash.startsWith('#/')
      ? window.location.hash.slice(1)
      : `${window.location.pathname}${window.location.search}` || '/';
    return route === '/' || route === '/work/queue';
  });
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs: Date.now() - startedAt,
    route,
    category: 'interaction',
  });
}

async function benchmarkStockCountSave(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
) {
  await returnToRecordUpdateHub(launched);
  await openHubLane(launched, HUB_LANES[0]!);

  await openFirstWorkbenchTile(launched);
  const itemDialog = launched.page.getByRole('dialog').first();
  await itemDialog.getByRole('textbox', { name: 'Units in stock' }).fill('7');
  await itemDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await completeReviewSaveFlow(launched, {
    metricName: 'interaction.save_stock_count_ms',
    reviewDialogTitle: 'Review update',
    reviewLabel: 'Review update',
    route: '/work/capture/stock-count',
  });
}

async function benchmarkSupplierReceiptSave(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
) {
  await returnToRecordUpdateHub(launched);
  const previousCount = await persistedBenchmarkEventCount(launched, 'route.work.capture.ready');
  await launched.page.getByRole('button', { name: 'Supplier Order' }).click();
  const editButton = launched.page.getByRole('button', { name: 'Edit/Update', exact: true });
  if (await editButton.isEnabled().catch(() => false)) {
    await editButton.click();
    await launched.page.locator('[role="dialog"] button').filter({ hasText: /Siem Reap Rattan|browser-batch-1/i }).first().click();
  } else {
    const newButton = launched.page.getByRole('button', { name: 'New', exact: true });
    if (await newButton.isVisible().catch(() => false)) {
      await newButton.click();
      const replaceDraftDialog = launched.page.getByRole('dialog').filter({ hasText: 'Delete saved draft?' });
      if (await replaceDraftDialog.isVisible().catch(() => false)) {
        await replaceDraftDialog.getByRole('button', { name: 'Delete draft and start new', exact: true }).click();
      }
    }
  }
  await waitForRecordUpdateReady(launched, previousCount);

  await openFirstWorkbenchTile(launched);
  await launched.page.getByRole('dialog').first().getByRole('button', { name: 'Add line', exact: true }).click();
  await completeReviewSaveFlow(launched, {
    metricName: 'interaction.save_supplier_order_receipt_ms',
    reviewDialogTitle: 'Confirm receipt',
    reviewLabel: 'Review receipt',
    route: '/work/capture/supplier-order',
  });
}

test('capture hub opens current lanes and saves current flows', async ({}, testInfo) => {
  const launched = await launchKaurKhorForBenchmark('capture-hub-current-flows', testInfo);
  let scenarioError: unknown = null;
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await markBenchmarkMeasurementStart(launched, { workflow: 'capture' });
    await returnToRecordUpdateHub(launched);

    for (const lane of HUB_LANES) {
      await openHubLane(launched, lane);
      await returnToRecordUpdateHub(launched);
    }

    await benchmarkStockCountSave(launched);
    await benchmarkSupplierReceiptSave(launched);
  } catch (error) {
    scenarioError = error;
  } finally {
    await markBenchmarkMeasurementEnd(launched, {
      workflow: 'capture',
      ok: scenarioError == null,
    });
    await closeKaurKhorBenchmarkApp(launched, 'capture');
  }
  if (scenarioError) {
    throw scenarioError;
  }
});
