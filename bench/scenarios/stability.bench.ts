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

const CYCLE_SECTIONS: Array<{
  label: string;
  metricName?: string;
  path: `/${string}`;
  readyEvent: string;
}> = [
  { label: 'Record update', path: '/record-update', readyEvent: 'route.record-update.ready' },
  { label: 'Performance', metricName: 'nav.dashboard_to_performance_ms', path: '/performance', readyEvent: 'route.performance.ready' },
  { label: 'Catalog', path: '/catalog', readyEvent: 'route.catalog.ready' },
  { label: 'Financials', metricName: 'nav.performance_to_financials_ms', path: '/financials', readyEvent: 'route.financials.ready' },
  { label: 'Automations', metricName: 'nav.to_automations_ms', path: '/automations', readyEvent: 'route.automations.ready' },
  { label: 'Analysis', metricName: 'nav.financials_to_analysis_ms', path: '/analysis', readyEvent: 'route.analysis.ready' },
  { label: 'Logs', path: '/operations', readyEvent: 'route.operations.ready' },
  { label: 'Overview', path: '/', readyEvent: 'route.dashboard.ready' },
];

test('repeated sidebar navigation stays crash-free and records memory slope inputs', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('stability-sidebar-cycle', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (const section of CYCLE_SECTIONS) {
        const previousCount = await persistedBenchmarkEventCount(launched, section.readyEvent);
        const startedAt = Date.now();
        await clickSidebarNavigation(launched.page, section.label);
        await waitForPersistedBenchmarkEventCount(launched, section.readyEvent, previousCount + 1);
        if (section.metricName) {
          await recordPlaywrightDuration(launched.page, {
            metricName: section.metricName,
            durationMs: Date.now() - startedAt,
            route: section.path,
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
