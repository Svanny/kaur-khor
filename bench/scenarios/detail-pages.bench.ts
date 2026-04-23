import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  navigateBenchmarkRoute,
  persistedBenchmarkEventCount,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

async function recordPlaywrightDuration(
  launched: Awaited<ReturnType<typeof launchBanjiForBenchmark>>,
  metricName: string,
  durationMs: number,
  path: string,
  entityType: 'sku' | 'service',
  entityId: string,
) {
  await launched.page.evaluate(
    ({ duration, entity, id, metric, route }) => {
      const event = {
        runId: window.banjiDesktop.benchmark?.runId ?? 'playwright',
        ts: Date.now(),
        layer: 'playwright' as const,
        category: 'navigation' as const,
        name: metric,
        phase: 'end' as const,
        route,
        entityType: entity,
        entityId: id,
        command: null,
        durationMs: duration,
        detail: {},
      };
      window.__BANJI_BENCHMARK_EVENTS__ ??= [];
      window.__BANJI_BENCHMARK_EVENTS__.push(event);
      window.banjiDesktop.benchmark?.recordEvent(event);
    },
    { duration: durationMs, entity: entityType, id: entityId, metric: metricName, route: path },
  );
}

test('SKU and service detail pages expose first and repeat load timings', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('detail-pages', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    const targets = await launched.page.evaluate(async () => {
      const benchmarkWindow = window as Window & {
        banjiDesktop: {
          sena: {
            getCatalog: () => Promise<{
              skus: Array<{ archived: boolean; skuId: string }>;
              services: Array<{ archived: boolean; serviceId: string }>;
            } | null>;
          };
        };
      };
      const catalog = await benchmarkWindow.banjiDesktop.sena.getCatalog();
      return {
        skuId: catalog?.skus.find((sku) => !sku.archived)?.skuId ?? null,
        serviceId: catalog?.services.find((service) => !service.archived)?.serviceId ?? null,
      };
    });

    if (targets.skuId) {
      const firstSkuCount = await persistedBenchmarkEventCount(launched, 'route.sku-detail.ready');
      const skuPath = `/catalog/skus/${targets.skuId}` as const;
      const firstStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, skuPath);
      await waitForPersistedBenchmarkEventCount(launched, 'route.sku-detail.ready', firstSkuCount + 1);
      await recordPlaywrightDuration(launched, 'detail.sku_first_load_ms', Date.now() - firstStartedAt, skuPath, 'sku', targets.skuId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_sku_detail_first_mb');

      const repeatSkuCount = await persistedBenchmarkEventCount(launched, 'route.sku-detail.ready');
      const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
      await navigateBenchmarkRoute(launched.page, '/');
      await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
      const repeatStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, skuPath);
      await waitForPersistedBenchmarkEventCount(launched, 'route.sku-detail.ready', repeatSkuCount + 1);
      await recordPlaywrightDuration(launched, 'detail.sku_repeat_load_ms', Date.now() - repeatStartedAt, skuPath, 'sku', targets.skuId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_sku_detail_repeat_mb');
    }

    if (targets.serviceId) {
      const firstServiceCount = await persistedBenchmarkEventCount(launched, 'route.service-detail.ready');
      const servicePath = `/catalog/services/${targets.serviceId}` as const;
      const firstStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, servicePath);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.service-detail.ready',
        firstServiceCount + 1,
      );
      await recordPlaywrightDuration(launched, 'detail.service_first_load_ms', Date.now() - firstStartedAt, servicePath, 'service', targets.serviceId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_service_detail_first_mb');

      const repeatServiceCount = await persistedBenchmarkEventCount(launched, 'route.service-detail.ready');
      const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
      await navigateBenchmarkRoute(launched.page, '/');
      await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
      const repeatStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, servicePath);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.service-detail.ready',
        repeatServiceCount + 1,
      );
      await recordPlaywrightDuration(launched, 'detail.service_repeat_load_ms', Date.now() - repeatStartedAt, servicePath, 'service', targets.serviceId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_service_detail_repeat_mb');
    }
  } finally {
    await closeBanjiBenchmarkApp(launched, 'detail-pages');
  }
});
