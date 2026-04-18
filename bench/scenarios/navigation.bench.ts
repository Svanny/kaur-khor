import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  navigateHashRoute,
  persistedBenchmarkEventCount,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

const ROUTES: Array<{ metric: string; path: `/${string}`; readyEvent: string }> = [
  { metric: 'nav.dashboard_to_performance_ms', path: '/performance', readyEvent: 'route.performance.ready' },
  { metric: 'nav.performance_to_financials_ms', path: '/financials', readyEvent: 'route.financials.ready' },
  { metric: 'nav.financials_to_analysis_ms', path: '/analysis', readyEvent: 'route.analysis.ready' },
  { metric: 'nav.dashboard_to_record_update_ms', path: '/record-update', readyEvent: 'route.record-update.ready' },
  { metric: 'nav.record_update_to_operations_ms', path: '/operations', readyEvent: 'route.operations.ready' },
];

test('major route transitions reach ready state', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('navigation-major-routes', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    for (const route of ROUTES) {
      const previousCount = await persistedBenchmarkEventCount(launched, route.readyEvent);
      const startedAt = Date.now();
      await navigateHashRoute(launched.page, route.path);
      await waitForPersistedBenchmarkEventCount(launched, route.readyEvent, previousCount + 1);
      const durationMs = Date.now() - startedAt;
      await launched.page.evaluate(
        ({ metricName, duration, path }) => {
          const benchmarkWindow = window as Window & {
            __BANJI_BENCHMARK_EVENTS__?: unknown[];
            banjiDesktop: {
              benchmark?: {
                runId: string;
                recordEvent: (event: unknown) => void;
              };
            };
          };
          const event = {
            runId: benchmarkWindow.banjiDesktop.benchmark?.runId ?? 'playwright',
            ts: Date.now(),
            layer: 'playwright' as const,
            category: 'navigation' as const,
            name: metricName,
            phase: 'end' as const,
            route: path,
            entityType: null,
            entityId: null,
            command: null,
            durationMs: duration,
            detail: {},
          };
          benchmarkWindow.__BANJI_BENCHMARK_EVENTS__ ??= [];
          benchmarkWindow.__BANJI_BENCHMARK_EVENTS__.push(event);
          benchmarkWindow.banjiDesktop.benchmark?.recordEvent(event);
        },
        { metricName: route.metric, duration: durationMs, path: route.path },
      );
      await snapshotRendererBenchmarkMemory(launched.page, `memory.renderer_after_${route.path.replace(/\W+/g, '_')}_mb`);
    }
  } finally {
    await closeBanjiBenchmarkApp(launched, 'navigation');
  }
});
