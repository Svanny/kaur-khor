import { expect, test } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import {
  closeDesktopUiMatrix,
  desktopWorkspaceCounts,
  launchDesktopUiMatrix,
  resizeDesktopWindow,
  saveAllVisibilityPreferences,
} from '../helpers/desktop';
import {
  assertDesktopBridgeConsistent,
  correctLatestObservationNotesThroughUi,
  createServiceThroughUi,
  createSkuThroughUi,
  editSkuCostAndPriceThroughUi,
  fulfillCustomerTicketThroughUi,
  latestTicketIdForEntity,
  saveCustomerOrderThroughUi,
  saveCustomerTicketRevisionThroughUi,
  saveImmediateSaleThroughUi,
  saveStockCountThroughUi,
  saveSupplierOrderThroughUi,
  saveSupplierReceiptThroughUi,
  saveSupplierTicketRevisionThroughUi,
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

      const correctionNote = 'UI matrix correction: stock count verified after recount.';
      await correctLatestObservationNotesThroughUi(launched.page, correctionNote);
      await navigateHashRoute(launched.page, '/settings/history?view=all');
      await expect(launched.page.getByText(correctionNote)).toBeVisible();
      await assertUiStable(launched.page, 'dependent corrected previous stock count');
      await captureUi(launched.page, testInfo, 'dependent-stock-count-corrected');

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
      const customerTicketId = await latestTicketIdForEntity(launched.page, {
        entityId: service.serviceId,
        family: 'customer',
      });
      expect(customerTicketId, 'customer ticket id should exist after pending customer order').toBeTruthy();
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

      await saveCustomerTicketRevisionThroughUi(launched.page, {
        expectedArrivalDate: '2026-05-27',
        quantity: '3',
        targetId: service.serviceId,
        targetName: service.name,
        targetType: 'service',
        ticketId: customerTicketId!,
      });
      await assertUiStable(launched.page, 'dependent after customer ticket revision');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: service.serviceId,
          eventType: 'revised',
          family: 'customer',
          stage: 'pending',
        },
        minObservationCount: initialCounts.observationCount + 3,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-customer-ticket-revised');

      await fulfillCustomerTicketThroughUi(launched.page, {
        note: 'UI matrix fulfilled customer ticket from the Work queue.',
        ticketId: customerTicketId!,
      });
      await assertUiStable(launched.page, 'dependent after customer ticket fulfillment');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: service.serviceId,
          eventType: 'fulfilled_immediate',
          family: 'customer',
          stage: 'fulfilled_immediate',
        },
        minObservationCount: initialCounts.observationCount + 4,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-customer-ticket-fulfilled');

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
      const supplierTicketId = await latestTicketIdForEntity(launched.page, {
        entityId: sku.skuId,
        family: 'supplier',
      });
      expect(supplierTicketId, 'supplier ticket id should exist after supplier order').toBeTruthy();
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

      await saveSupplierTicketRevisionThroughUi(launched.page, {
        expectedArrivalDate: '2026-05-30',
        quantity: '7',
        skuId: sku.skuId,
        skuName: sku.name,
        ticketId: supplierTicketId!,
      });
      await assertUiStable(launched.page, 'dependent after supplier ticket revision');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: sku.skuId,
          eventType: 'revised',
          family: 'supplier',
          minQuantityDelta: 7,
          stage: 'ordered_waiting',
        },
        minObservationCount: initialCounts.observationCount + 6,
        minOrderBatchCount: afterSaveCounts.orderBatchCount,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-supplier-ticket-revised');

      await saveSupplierReceiptThroughUi(launched.page, {
        quantity: '2',
        skuId: sku.skuId,
        skuName: sku.name,
        ticketId: supplierTicketId!,
      });
      await assertUiStable(launched.page, 'dependent after supplier receipt');
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: sku.skuId,
          eventType: 'partial_received',
          family: 'supplier',
          minQuantityDelta: 2,
          stage: 'partial_received',
        },
        minObservationCount: initialCounts.observationCount + 7,
        minOrderBatchCount: afterSaveCounts.orderBatchCount,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await captureUi(launched.page, testInfo, 'dependent-supplier-receipt-saved');

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
      expect(bridgeState.observationCount).toBeGreaterThanOrEqual(initialCounts.observationCount + 7);
      expect(bridgeState.orderSignalCount).toBeGreaterThan(0);
      expect(bridgeState.ticketEventCount).toBeGreaterThanOrEqual(6);

      const consistencyRoutes: Array<{ route: `/${string}`; text: string }> = [
        { route: '/catalog', text: sku.name },
        { route: `/catalog/skus/${sku.skuId}`, text: sku.name },
        { route: `/catalog/services/${service.serviceId}`, text: service.name },
        { route: '/', text: 'Command home' },
        { route: '/work/queue', text: 'Queue' },
        { route: '/settings/history', text: 'Saved updates' },
        { route: '/insights/inventory', text: 'Inventory health grid' },
        { route: '/insights/money', text: 'Money' },
        { route: '/insights/explain', text: 'Explain' },
        { route: '/settings/automation', text: 'Automations' },
      ];

      for (const routeCase of consistencyRoutes) {
        await navigateHashRoute(launched.page, routeCase.route);
        await scrollMainSurface(launched.page);
        await expect(launched.page.getByText(routeCase.text, { exact: false }).first()).toBeVisible();
        await assertUiStable(launched.page, `dependent consistency ${routeCase.route}`);
      }

      await resizeDesktopWindow(launched, { width: 1280, height: 800 });
      await assertUiStable(launched.page, 'dependent desktop resized 1280x800');
      await captureUi(launched.page, testInfo, 'dependent-desktop-resized-1280');
      await resizeDesktopWindow(launched, { width: 1600, height: 1000 });
      await assertUiStable(launched.page, 'dependent desktop resized 1600x1000');

      await launched.page.reload({ waitUntil: 'domcontentloaded' });
      await navigateHashRoute(launched.page, '/catalog');
      await expect(launched.page.getByText(sku.name, { exact: false }).first()).toBeVisible();
      await expect(launched.page.getByText(service.name, { exact: false }).first()).toBeVisible();
      await assertUiStable(launched.page, 'dependent catalog after reload');
      await captureUi(launched.page, testInfo, 'dependent-catalog-after-reload');

      const relaunchDataDirectory = launched.dataDirectory;
      const relaunchOutputDirectory = launched.outputDirectory;
      await closeDesktopUiMatrix(launched);
      const relaunched = await launchDesktopUiMatrix({
        dataDirectory: relaunchDataDirectory,
        fresh: true,
        name: 'desktop-dependent-relaunch',
        outputDirectory: relaunchOutputDirectory,
        testInfo,
      });
      Object.assign(launched, relaunched);
      await navigateHashRoute(launched.page, '/catalog');
      await expect(launched.page.getByText(sku.name, { exact: false }).first()).toBeVisible();
      await expect(launched.page.getByText(service.name, { exact: false }).first()).toBeVisible();
      await navigateHashRoute(launched.page, '/settings/history');
      await expect(launched.page.getByText('Saved updates', { exact: false }).first()).toBeVisible();
      await assertDesktopBridgeConsistent(launched.page, {
        expectedTicket: {
          entityId: sku.skuId,
          family: 'supplier',
          minQuantityDelta: 5,
        },
        minObservationCount: initialCounts.observationCount + 7,
        requireDetailRead: true,
        serviceId: service.serviceId,
        skuId: sku.skuId,
      });
      await assertUiStable(launched.page, 'dependent after desktop relaunch');
      await captureUi(launched.page, testInfo, 'dependent-history-after-desktop-relaunch');
      launched.issues.assertNoIssues('dependent desktop matrix');
    } finally {
      await closeDesktopUiMatrix(launched);
    }
  });
});
