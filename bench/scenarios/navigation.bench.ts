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

const SIDEBAR_SECTIONS: Array<{
  label: string;
  metric?: string;
  path: `/${string}`;
  readyEvent: string;
}> = [
  { label: 'Record update', metric: 'nav.dashboard_to_record_update_ms', path: '/record-update', readyEvent: 'route.record-update.ready' },
  { label: 'Performance', metric: 'nav.dashboard_to_performance_ms', path: '/performance', readyEvent: 'route.performance.ready' },
  { label: 'Catalog', metric: 'nav.dashboard_to_catalog_ms', path: '/catalog', readyEvent: 'route.catalog.ready' },
  { label: 'Financials', metric: 'nav.performance_to_financials_ms', path: '/financials', readyEvent: 'route.financials.ready' },
  { label: 'Automations', path: '/automations', readyEvent: 'route.automations.ready' },
  { label: 'Analysis', metric: 'nav.financials_to_analysis_ms', path: '/analysis', readyEvent: 'route.analysis.ready' },
  { label: 'Operations', path: '/operations', readyEvent: 'route.operations.ready' },
  { label: 'Help', path: '/help', readyEvent: 'route.help.ready' },
  { label: 'Settings', path: '/settings', readyEvent: 'route.settings.ready' },
];

async function waitForRouteReady(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  readyEvent: string,
) {
  const previousCount = await persistedBenchmarkEventCount(launched, readyEvent);
  await waitForPersistedBenchmarkEventCount(launched, readyEvent, previousCount + 1);
}

async function measureOverviewTaskDrawerOpen(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
) {
  const recentReceiptsSection = launched.page
    .locator('section')
    .filter({ has: launched.page.getByRole('heading', { name: 'Recent receipts' }) });
  const recentReceiptButton = recentReceiptsSection.getByRole('button').first();
  if (await recentReceiptButton.count() === 0) {
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

test('major sidebar transitions reach ready state', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('navigation-sidebar-routes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    for (const section of SIDEBAR_SECTIONS) {
      const startedAt = Date.now();
      await clickSidebarNavigation(launched.page, section.label);
      await waitForRouteReady(launched, section.readyEvent);
      if (section.metric) {
        await recordPlaywrightDuration(launched.page, {
          metricName: section.metric,
          durationMs: Date.now() - startedAt,
          route: section.path,
          category: 'navigation',
        });
      }
      await snapshotRendererBenchmarkMemory(
        launched.page,
        `memory.renderer_after_${section.path.replace(/\W+/g, '_')}_mb`,
      );
    }

    await clickSidebarNavigation(launched.page, 'Overview');
    await waitForRouteReady(launched, 'route.dashboard.ready');
    await measureOverviewTaskDrawerOpen(launched);
  } finally {
    await closeBanjiBenchmarkApp(launched, 'navigation');
  }
});
