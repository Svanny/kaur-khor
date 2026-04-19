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

const ROUTES: Array<{ from?: `/${string}`; metric: string; path: `/${string}`; readyEvent: string }> = [
  { metric: 'nav.dashboard_to_performance_ms', path: '/performance', readyEvent: 'route.performance.ready' },
  { metric: 'nav.performance_to_financials_ms', path: '/financials', readyEvent: 'route.financials.ready' },
  { metric: 'nav.financials_to_analysis_ms', path: '/analysis', readyEvent: 'route.analysis.ready' },
  { from: '/', metric: 'nav.dashboard_to_record_update_ms', path: '/record-update', readyEvent: 'route.record-update.ready' },
  { from: '/', metric: 'nav.dashboard_to_catalog_ms', path: '/catalog', readyEvent: 'route.catalog.ready' },
  { from: '/', metric: 'nav.dashboard_to_operations_ms', path: '/operations', readyEvent: 'route.operations.ready' },
];

async function measureOverviewTaskDrawerOpen(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  const recentReceiptsSection = launched.page
    .locator('section')
    .filter({ has: launched.page.getByRole('heading', { name: 'Recent receipts' }) });
  const recentReceiptButton = recentReceiptsSection.getByRole('button').first();
  const hasRecentReceiptButton = await recentReceiptButton.count();
  if (hasRecentReceiptButton === 0) {
    return;
  }

  const startedAt = Date.now();
  await recentReceiptButton.click();
  await launched.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
  await recordPlaywrightDuration(launched.page, {
    metricName: 'interaction.open_task_drawer_ms',
    durationMs: Date.now() - startedAt,
    route: '/',
    category: 'interaction',
    detail: { source: 'recent-receipts' },
  });
}

test('major route transitions reach ready state', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('navigation-major-routes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    for (const route of ROUTES) {
      if (route.from) {
        const previousDashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
        await navigateHashRoute(launched.page, route.from);
        await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', previousDashboardCount + 1);
      }
      const previousCount = await persistedBenchmarkEventCount(launched, route.readyEvent);
      const startedAt = Date.now();
      await navigateHashRoute(launched.page, route.path);
      await waitForPersistedBenchmarkEventCount(launched, route.readyEvent, previousCount + 1);
      await recordPlaywrightDuration(launched.page, {
        metricName: route.metric,
        durationMs: Date.now() - startedAt,
        route: route.path,
        category: 'navigation',
      });
      await snapshotRendererBenchmarkMemory(launched.page, `memory.renderer_after_${route.path.replace(/\W+/g, '_')}_mb`);
    }

    const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
    await navigateHashRoute(launched.page, '/');
    await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
    await measureOverviewTaskDrawerOpen(launched);
  } finally {
    await closeBanjiBenchmarkApp(launched, 'navigation');
  }
});
