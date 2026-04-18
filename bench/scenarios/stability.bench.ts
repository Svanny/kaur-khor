import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  navigateHashRoute,
  persistedBenchmarkEventCount,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

const CYCLE_ROUTES: Array<{ path: `/${string}`; readyEvent: string }> = [
  { path: '/', readyEvent: 'route.dashboard.ready' },
  { path: '/performance', readyEvent: 'route.performance.ready' },
  { path: '/financials', readyEvent: 'route.financials.ready' },
  { path: '/analysis', readyEvent: 'route.analysis.ready' },
  { path: '/operations', readyEvent: 'route.operations.ready' },
];

test('repeated navigation stays crash-free and records memory slope inputs', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('stability-navigation-cycle', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (const route of CYCLE_ROUTES) {
        const previousCount = await persistedBenchmarkEventCount(launched, route.readyEvent);
        await navigateHashRoute(launched.page, route.path);
        await waitForPersistedBenchmarkEventCount(launched, route.readyEvent, previousCount + 1);
      }
      await snapshotRendererBenchmarkMemory(launched.page, `memory.renderer_stability_cycle_${cycle + 1}_mb`);
    }

    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_stability_mb');
  } finally {
    await closeBanjiBenchmarkApp(launched, 'stability');
  }
});
