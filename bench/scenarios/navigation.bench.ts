import { test } from '@playwright/test';
import {
  clickSidebarNavigationAndMeasureDuration,
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
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
  { label: 'Work', metric: 'nav.home_to_work_ms', path: '/work/queue', readyEvent: 'route.work.queue.ready' },
  { label: 'Catalog', metric: 'nav.work_to_catalog_ms', path: '/catalog', readyEvent: 'route.catalog.ready' },
  { label: 'Insights', metric: 'nav.work_to_insights_ms', path: '/insights/pressure', readyEvent: 'route.insights.pressure.ready' },
  { label: 'Settings', path: '/settings', readyEvent: 'route.settings.ready' },
];

async function switchInsightsMode(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
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
  await launched.page.getByRole('link', { name: new RegExp(label, 'i') }).click();
  await waitForPersistedBenchmarkEventCount(launched, readyEvent, previousCount + 1);
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs: Date.now() - startedAt,
    route,
    category: 'navigation',
  });
}

test('major sidebar transitions reach ready state', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('navigation-sidebar-routes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await markBenchmarkMeasurementStart(launched, { workflow: 'navigation' });

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

    await clickSidebarNavigationAndMeasureDuration(launched, {
      label: 'Back to app',
      readyEvent: 'route.home.ready',
      route: '/',
      category: 'navigation',
    });
    await markBenchmarkMeasurementEnd(launched, { workflow: 'navigation', ok: true });
  } finally {
    await closeBanjiBenchmarkApp(launched, 'navigation');
  }
});
