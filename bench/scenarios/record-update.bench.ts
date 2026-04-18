import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  navigateHashRoute,
  persistedBenchmarkEventCount,
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

test('record update lanes become interactive', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('record-update-lanes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    for (const lane of LANES) {
      const previousCount = await persistedBenchmarkEventCount(launched, 'route.record-update.ready');
      await navigateHashRoute(launched.page, lane.path);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.record-update.ready',
        previousCount + 1,
      );
      await snapshotRendererBenchmarkMemory(
        launched.page,
        `memory.renderer_after_record_update_${lane.name.replace(/\W+/g, '_')}_mb`,
      );
    }
  } finally {
    await closeBanjiBenchmarkApp(launched, 'record-update');
  }
});
