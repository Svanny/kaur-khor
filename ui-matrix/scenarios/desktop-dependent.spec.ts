import { expect, test } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import {
  closeDesktopUiMatrix,
  desktopWorkspaceCounts,
  launchDesktopUiMatrix,
  saveAllVisibilityPreferences,
} from '../helpers/desktop';
import {
  assertDesktopBridgeConsistent,
  createServiceThroughUi,
  createSkuThroughUi,
  editSkuCostAndPriceThroughUi,
  saveCustomerOrderThroughUi,
  saveImmediateSaleThroughUi,
  saveStockCountThroughUi,
  saveSupplierOrderThroughUi,
} from '../helpers/forms';
import {
  assertUiStable,
  captureUi,
  navigateHashRoute,
  scrollMainSurface,
} from '../helpers/runtime-guards';

test.describe('UI matrix: desktop dependent state', () => {
  test('organic catalog and stock updates propagate across pages and reload', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'desktop-dependent-organic-update-chain')?.expectedUi ?? '',
    });

    const launched = await launchDesktopUiMatrix({
      fresh: true,
      name: 'desktop-dependent',
      testInfo,
    });

    try {
      await launched.page.waitForLoadState('domcontentloaded');
      await saveAllVisibilityPreferences(launched.page);
      await launched.page.reload({ waitUntil: 'domcontentloaded' });

      const initialCounts = await desktopWorkspaceCounts(launched.page);
      expect(initialCounts.skuCount).toBe(0);
      expect(initialCounts.observationCount).toBe(0);

      const sku = await createSkuThroughUi(launched.page, {
        cost: '4.25',
        name: 'Matrix Tamarind Jar',
        price: '12.50',
        supplier: 'Matrix Supplier',
      });
      await assertUiStable(launched.page, 'dependent SKU detail after create');
      await assertDesktopBridgeConsistent(launched.page, {
        minObservationCount: initialCounts.observationCount,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-sku-created');

      const service = await createServiceThroughUi(launched.page, {
        name: 'Matrix Gift Wrap',
        price: '19.00',
        skuName: sku.name,
      });
      await assertUiStable(launched.page, 'dependent service detail after create');
      await assertDesktopBridgeConsistent(launched.page, {
        minObservationCount: initialCounts.observationCount,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-service-created');

      await editSkuCostAndPriceThroughUi(launched.page, sku.skuId, {
        cost: '5.00',
        price: '13.50',
      });
      await assertUiStable(launched.page, 'dependent SKU detail after price edit');
      await assertDesktopBridgeConsistent(launched.page, {
        minObservationCount: initialCounts.observationCount,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-sku-price-edit');

      await saveStockCountThroughUi(launched.page, sku.skuId, '7');
      await assertUiStable(launched.page, 'dependent after stock count save');
      await assertDesktopBridgeConsistent(launched.page, {
        minObservationCount: initialCounts.observationCount + 1,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-stock-count-saved');

      const afterSaveCounts = await desktopWorkspaceCounts(launched.page);
      expect(afterSaveCounts.skuCount).toBeGreaterThanOrEqual(1);
      expect(afterSaveCounts.serviceCount).toBeGreaterThanOrEqual(1);
      expect(afterSaveCounts.observationCount).toBeGreaterThan(initialCounts.observationCount);

      await saveCustomerOrderThroughUi(launched.page, {
        expectedArrivalDate: '2026-05-20',
        quantity: '2',
        targetId: service.serviceId,
        targetName: service.name,
        targetType: 'service',
      });
      await assertUiStable(launched.page, 'dependent after customer order save');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: service.serviceId,
          eventType: 'created',
          family: 'customer',
          minQuantityDelta: 2,
          stage: 'pending',
        },
        minObservationCount: initialCounts.observationCount + 2,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-customer-order-saved');

      await saveImmediateSaleThroughUi(launched.page, {
        quantity: '1',
        targetId: sku.skuId,
        targetName: sku.name,
        targetType: 'sku',
      });
      await assertUiStable(launched.page, 'dependent after immediate sale save');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: sku.skuId,
          eventType: 'fulfilled_immediate',
          family: 'customer',
          minQuantityDelta: 1,
          stage: 'fulfilled_immediate',
        },
        minObservationCount: initialCounts.observationCount + 3,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-immediate-sale-saved');

      await saveSupplierOrderThroughUi(launched.page, {
        expectedArrivalDate: '2026-05-23',
        quantity: '5',
        skuId: sku.skuId,
        skuName: sku.name,
      });
      await assertUiStable(launched.page, 'dependent after supplier order save');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: sku.skuId,
          eventType: 'created',
          family: 'supplier',
          minQuantityDelta: 5,
          stage: 'ordered_waiting',
        },
        minObservationCount: initialCounts.observationCount + 4,
        minOrderBatchCount: afterSaveCounts.orderBatchCount,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-supplier-order-saved');

      const bridgeState = await launched.page.evaluate(async ({ serviceId, skuId }) => {
        const [catalog, observations, skuDetail, serviceDetail] = await Promise.all([
          window.kaurKhorDesktop.sena.getCatalog(),
          window.kaurKhorDesktop.sena.listObservations(),
          window.kaurKhorDesktop.sena.getSkuDetail({ skuId }),
          window.kaurKhorDesktop.sena.getServiceDetail({ serviceId }),
        ]);
        const savedSku = catalog?.skus.find((entry) => entry.skuId === skuId);
        const savedService = catalog?.services.find((entry) => entry.serviceId === serviceId);
        return {
          hasService: Boolean(savedService && serviceDetail),
          hasSku: Boolean(savedSku && skuDetail),
          observationCount: observations.length,
          orderSignalCount: observations.flatMap((entry) => entry.input.orderSignals).length,
          serviceDetailName: savedService?.name ?? null,
          skuDetailName: savedSku?.name ?? null,
          ticketEventCount: observations.flatMap((entry) => entry.input.ticketEvents ?? []).length,
        };
      }, { serviceId: service.serviceId, skuId: sku.skuId });

      expect(bridgeState).toMatchObject({
        hasService: true,
        hasSku: true,
        serviceDetailName: service.name,
        skuDetailName: sku.name,
      });
      expect(bridgeState.observationCount).toBeGreaterThanOrEqual(initialCounts.observationCount + 4);
      expect(bridgeState.orderSignalCount).toBeGreaterThan(0);
      expect(bridgeState.ticketEventCount).toBeGreaterThanOrEqual(3);

      const consistencyRoutes: Array<{ route: `/${string}`; text: string }> = [
        { route: '/catalog', text: sku.name },
        { route: `/catalog/skus/${sku.skuId}`, text: sku.name },
        { route: `/catalog/services/${service.serviceId}`, text: service.name },
        { route: '/settings/history', text: 'Saved updates' },
        { route: '/insights/inventory', text: 'Inventory health grid' },
      ];

      for (const routeCase of consistencyRoutes) {
        await navigateHashRoute(launched.page, routeCase.route);
        await scrollMainSurface(launched.page);
        await expect(launched.page.getByText(routeCase.text, { exact: false }).first()).toBeVisible();
        await assertUiStable(launched.page, `dependent consistency ${routeCase.route}`);
      }

      await launched.page.reload({ waitUntil: 'domcontentloaded' });
      await navigateHashRoute(launched.page, '/catalog');
      await expect(launched.page.getByText(sku.name, { exact: false }).first()).toBeVisible();
      await expect(launched.page.getByText(service.name, { exact: false }).first()).toBeVisible();
      await assertUiStable(launched.page, 'dependent catalog after reload');
      await captureUi(launched.page, testInfo, 'dependent-catalog-after-reload');
      launched.issues.assertNoIssues('dependent desktop matrix');
    } finally {
      await closeDesktopUiMatrix(launched);
    }
  });
});
