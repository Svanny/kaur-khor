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

async function recordPlaywrightDuration(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  metricName: string,
  durationMs: number,
  path: string,
) {
  await launched.page.evaluate(
    ({ duration, metric, route }) => {
      const event = {
        runId: window.banjiDesktop.benchmark?.runId ?? 'playwright',
        ts: Date.now(),
        layer: 'playwright' as const,
        category: 'navigation' as const,
        name: metric,
        phase: 'end' as const,
        route,
        entityType: null,
        entityId: null,
        command: null,
        durationMs: duration,
        detail: {},
      };
      window.__BANJI_BENCHMARK_EVENTS__ ??= [];
      window.__BANJI_BENCHMARK_EVENTS__.push(event);
      window.banjiDesktop.benchmark?.recordEvent(event);
    },
    { duration: durationMs, metric: metricName, route: path },
  );
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
      await recordPlaywrightDuration(
        launched,
        lane.name === 'stock-count' ? 'interaction.open_record_update_ms' : 'nav.record_update_lane_switch_ms',
        Date.now() - startedAt,
        lane.path,
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
