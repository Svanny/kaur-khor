import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  navigateHashRoute,
  persistedBenchmarkEventCount,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

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
      await navigateHashRoute(launched.page, `/catalog/skus/${targets.skuId}`);
      await waitForPersistedBenchmarkEventCount(launched, 'route.sku-detail.ready', firstSkuCount + 1);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_sku_detail_first_mb');

      const repeatSkuCount = await persistedBenchmarkEventCount(launched, 'route.sku-detail.ready');
      const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
      await navigateHashRoute(launched.page, '/');
      await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
      await navigateHashRoute(launched.page, `/catalog/skus/${targets.skuId}`);
      await waitForPersistedBenchmarkEventCount(launched, 'route.sku-detail.ready', repeatSkuCount + 1);
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_sku_detail_repeat_mb');
    }

    if (targets.serviceId) {
      const firstServiceCount = await persistedBenchmarkEventCount(launched, 'route.service-detail.ready');
      await navigateHashRoute(launched.page, `/catalog/services/${targets.serviceId}`);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.service-detail.ready',
        firstServiceCount + 1,
      );
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_service_detail_first_mb');

      const repeatServiceCount = await persistedBenchmarkEventCount(launched, 'route.service-detail.ready');
      const dashboardCount = await persistedBenchmarkEventCount(launched, 'route.dashboard.ready');
      await navigateHashRoute(launched.page, '/');
      await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', dashboardCount + 1);
      await navigateHashRoute(launched.page, `/catalog/services/${targets.serviceId}`);
      await waitForPersistedBenchmarkEventCount(
        launched,
        'route.service-detail.ready',
        repeatServiceCount + 1,
      );
      await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_service_detail_repeat_mb');
    }
  } finally {
    await closeBanjiBenchmarkApp(launched, 'detail-pages');
  }
});
