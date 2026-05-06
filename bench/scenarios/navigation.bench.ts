import { test } from '@playwright/test';
import {
  clickSidebarNavigationAndMeasureDuration,
  closeKaurKhorBenchmarkApp,
  currentBenchmarkRoute,
  launchKaurKhorForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
  navigateBenchmarkRoute,
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
  { label: 'Work', metric: 'nav.home_to_work_ms', path: '/work', readyEvent: 'route.work.ready' },
  { label: 'Catalog', metric: 'nav.work_to_catalog_ms', path: '/catalog', readyEvent: 'route.catalog.ready' },
  { label: 'Insights', metric: 'nav.work_to_insights_ms', path: '/insights', readyEvent: 'route.insights.ready' },
  { label: 'Settings', path: '/settings', readyEvent: 'route.settings.ready' },
];

async function switchInsightsMode(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
  {
    label,
    metricName,
    readyEvent,
    route,
  }: {
    label: string;
    metricName: string;
    readyEvent: string;
    route: `/${string}`;
  },
) {
  const previousCount = await persistedBenchmarkEventCount(launched, readyEvent);
  const startedAt = Date.now();
  void label;
  await navigateBenchmarkRoute(launched.page, route);
  await waitForPersistedBenchmarkEventCount(launched, readyEvent, previousCount + 1);
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs: Date.now() - startedAt,
    route,
    category: 'navigation',
  });
}

test('major sidebar transitions reach ready state', async ({}, testInfo) => {
  const launched = await launchKaurKhorForBenchmark('navigation-sidebar-routes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await markBenchmarkMeasurementStart(launched, { workflow: 'navigation' });
    if (await currentBenchmarkRoute(launched.page) !== '/') {
      await navigateBenchmarkRoute(launched.page, '/');
    }

    for (const section of SIDEBAR_SECTIONS) {
      await clickSidebarNavigationAndMeasureDuration(launched, {
        label: section.label,
        readyEvent: section.readyEvent,
        metricName: section.metric,
        route: section.path,
        category: 'navigation',
      });
      await snapshotRendererBenchmarkMemory(
        launched.page,
        `memory.renderer_after_${section.path.replace(/\W+/g, '_')}_mb`,
      );
      if (section.label === 'Insights') {
        await switchInsightsMode(launched, {
          label: 'Money',
          metricName: 'nav.insights_pressure_to_money_ms',
          readyEvent: 'route.insights.money.ready',
          route: '/insights/money',
        });
        await switchInsightsMode(launched, {
          label: 'Explain',
          metricName: 'nav.insights_money_to_explain_ms',
          readyEvent: 'route.insights.explain.ready',
          route: '/insights/explain',
        });
      }
    }

    await markBenchmarkMeasurementEnd(launched, { workflow: 'navigation', ok: true });
  } finally {
    await closeKaurKhorBenchmarkApp(launched, 'navigation');
  }
});
