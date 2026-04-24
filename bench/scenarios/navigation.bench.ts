import { test } from '@playwright/test';
import {
  clickSidebarNavigationAndMeasureDuration,
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
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
  { label: 'Automations', metric: 'nav.to_automations_ms', path: '/automations', readyEvent: 'route.automations.ready' },
  { label: 'Analysis', metric: 'nav.financials_to_analysis_ms', path: '/analysis', readyEvent: 'route.analysis.ready' },
  { label: 'Logs', path: '/operations', readyEvent: 'route.operations.ready' },
  { label: 'Help', path: '/help', readyEvent: 'route.help.ready' },
  { label: 'Settings', path: '/settings', readyEvent: 'route.settings.ready' },
];

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
    }

    await clickSidebarNavigationAndMeasureDuration(launched, {
      label: 'Back to app',
      readyEvent: 'route.dashboard.ready',
      route: '/',
      category: 'navigation',
    });
    await markBenchmarkMeasurementEnd(launched, { workflow: 'navigation', ok: true });
  } finally {
    await closeBanjiBenchmarkApp(launched, 'navigation');
  }
});
