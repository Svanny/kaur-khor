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

const CYCLE_ROUTES: Array<{ path: `/${string}`; readyEvent: string; metricName?: string }> = [
  { path: '/performance', readyEvent: 'route.performance.ready', metricName: 'nav.dashboard_to_performance_ms' },
  { path: '/financials', readyEvent: 'route.financials.ready', metricName: 'nav.performance_to_financials_ms' },
  { path: '/analysis', readyEvent: 'route.analysis.ready', metricName: 'nav.financials_to_analysis_ms' },
  { path: '/operations', readyEvent: 'route.operations.ready' },
  { path: '/', readyEvent: 'route.dashboard.ready' },
];

test('repeated navigation stays crash-free and records memory slope inputs', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('stability-navigation-cycle', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (const route of CYCLE_ROUTES) {
        const previousCount = await persistedBenchmarkEventCount(launched, route.readyEvent);
        const startedAt = Date.now();
        await navigateHashRoute(launched.page, route.path);
        await waitForPersistedBenchmarkEventCount(launched, route.readyEvent, previousCount + 1);
        if (route.metricName) {
          await recordPlaywrightDuration(launched.page, {
            metricName: route.metricName,
            durationMs: Date.now() - startedAt,
            route: route.path,
            category: 'navigation',
            detail: { cycle: cycle + 1 },
          });
        }
      }
      await snapshotRendererBenchmarkMemory(launched.page, `memory.renderer_stability_cycle_${cycle + 1}_mb`);
    }

    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_stability_mb');
  } finally {
    await closeBanjiBenchmarkApp(launched, 'stability');
  }
});
