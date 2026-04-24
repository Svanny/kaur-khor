import { test } from '@playwright/test';
import {
  benchmarkEventCount,
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
  navigateBenchmarkRoute,
  persistedCompletedBenchmarkEventCount,
  persistedBenchmarkEventCount,
  snapshotRendererBenchmarkMemory,
  waitForPersistedCompletedBenchmarkEventCount,
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
  let scenarioError: unknown = null;
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await markBenchmarkMeasurementStart(launched, { workflow: 'detail-pages' });
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
      const firstSkuCount = await benchmarkEventCount(launched, 'route.sku-detail.ready');
      const firstSkuDetailIpcCount = await persistedCompletedBenchmarkEventCount(launched, 'ipc.banji:sena:get-sku-detail.handle');
      const skuPath = `/catalog/skus/${targets.skuId}` as const;
      const firstStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, skuPath);
      await waitForPersistedBenchmarkEventCount(launched, 'route.sku-detail.ready', firstSkuCount + 1);
      await waitForPersistedCompletedBenchmarkEventCount(launched, 'ipc.banji:sena:get-sku-detail.handle', firstSkuDetailIpcCount + 1);
      await recordPlaywrightDuration(launched, 'detail.sku_first_load_ms', Date.now() - firstStartedAt, skuPath, 'sku', targets.skuId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_sku_detail_first_mb');

      const repeatSkuCount = await benchmarkEventCount(launched, 'route.sku-detail.ready');
      const catalogCount = await benchmarkEventCount(launched, 'route.catalog.ready');
      await navigateBenchmarkRoute(launched.page, '/catalog');
      await waitForPersistedBenchmarkEventCount(launched, 'route.catalog.ready', catalogCount + 1);
      const repeatStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, skuPath);
      await waitForPersistedBenchmarkEventCount(launched, 'route.sku-detail.ready', repeatSkuCount + 1);
      await recordPlaywrightDuration(launched, 'detail.sku_repeat_load_ms', Date.now() - repeatStartedAt, skuPath, 'sku', targets.skuId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_sku_detail_repeat_mb');
    }

    if (targets.serviceId) {
      const firstServiceCount = await benchmarkEventCount(launched, 'route.service-detail.ready');
      const firstServiceDetailIpcCount = await persistedCompletedBenchmarkEventCount(launched, 'ipc.banji:sena:get-service-detail.handle');
      const servicePath = `/catalog/services/${targets.serviceId}` as const;
      const firstStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, servicePath);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.service-detail.ready',
        firstServiceCount + 1,
      );
      await waitForPersistedCompletedBenchmarkEventCount(
        launched,
        'ipc.banji:sena:get-service-detail.handle',
        firstServiceDetailIpcCount + 1,
      );
      await recordPlaywrightDuration(launched, 'detail.service_first_load_ms', Date.now() - firstStartedAt, servicePath, 'service', targets.serviceId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_service_detail_first_mb');

      const serviceRepeatPath = `${servicePath}?benchmarkRepeat=1` as const;
      const repeatStartedAt = Date.now();
      await navigateBenchmarkRoute(launched.page, serviceRepeatPath);
      await recordPlaywrightDuration(launched, 'detail.service_repeat_load_ms', Date.now() - repeatStartedAt, servicePath, 'service', targets.serviceId);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_service_detail_repeat_mb');
    }
  } catch (error) {
    scenarioError = error;
  } finally {
    await markBenchmarkMeasurementEnd(launched, {
      workflow: 'detail-pages',
      ok: scenarioError == null,
    });
    await closeBanjiBenchmarkApp(launched, 'detail-pages');
  }
  if (scenarioError) {
    throw scenarioError;
  }
});
