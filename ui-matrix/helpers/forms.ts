import { expect, type Page } from '@playwright/test';
import { navigateHashRoute } from './runtime-guards';

type TicketExpectation = {
  entityId?: string;
  eventType?: string;
  family?: string;
  minQuantityDelta?: number;
  stage?: string;
};

export async function createSkuThroughUi(page: Page, options?: {
  cost?: string;
  description?: string;
  name?: string;
  price?: string;
  supplier?: string;
}) {
  const name = options?.name ?? `Matrix SKU ${Date.now()}`;
  await navigateHashRoute(page, '/catalog/skus/new');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('combobox', { name: /^Supplier$/ }).click();
  await page.getByRole('option', { name: 'Custom supplier' }).click();
  await page.getByRole('textbox', { name: 'Custom supplier' }).fill(options?.supplier ?? 'Matrix Supplier');
  await page.getByLabel('Description').fill(options?.description ?? 'Created by the UI matrix dependent-state flow.');
  await page.getByRole('textbox', { name: 'Supplier Cost per Unit' }).fill(options?.cost ?? '4.25');
  await page.getByRole('checkbox', { name: 'Sell as product' }).check();
  await page.getByRole('textbox', { name: 'Customer Selling Price' }).fill(options?.price ?? '12.50');
  await page.getByTestId('sku-lead-time-mean-days-input').fill('7');
  await page.getByRole('combobox', { name: 'ETA variation' }).click();
  await page.getByRole('option', { name: /Normal/ }).click();
  await page.getByRole('button', { name: 'Create entry' }).click();
  await page.waitForFunction(() => {
    const skuId = window.location.hash.split('/catalog/skus/')[1]?.split(/[/?#]/)[0] ?? '';
    return Boolean(skuId && skuId !== 'new');
  });
  const skuId = await page.evaluate(() => window.location.hash.split('/catalog/skus/')[1]?.split(/[/?#]/)[0] ?? null);
  expect(skuId, 'created SKU id should be present in the route').toBeTruthy();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return { name, skuId: skuId! };
}

export async function createServiceThroughUi(page: Page, options?: {
  description?: string;
  name?: string;
  price?: string;
  skuName?: string;
}) {
  const name = options?.name ?? `Matrix Service ${Date.now()}`;
  await navigateHashRoute(page, '/catalog/services/new');
  await page.locator('label').filter({ hasText: 'Name' }).filter({ has: page.locator('input') }).first().locator('input').fill(name);
  await page.locator('label').filter({ hasText: 'Description' }).locator('textarea').fill(options?.description ?? 'Created by the UI matrix dependent-state flow.');
  if (options?.skuName) {
    await page.locator('[data-sku-tile="true"]').filter({ hasText: options.skuName }).click();
  }
  await page.locator('label').filter({ hasText: 'Selling service price' }).locator('input').fill(options?.price ?? '20.00');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await page.waitForFunction(() => {
    const serviceId = window.location.hash.split('/catalog/services/')[1]?.split(/[/?#]/)[0] ?? '';
    return Boolean(serviceId && serviceId !== 'new');
  });
  const serviceId = await page.evaluate(() => window.location.hash.split('/catalog/services/')[1]?.split(/[/?#]/)[0] ?? null);
  expect(serviceId, 'created service id should be present in the route').toBeTruthy();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return { name, serviceId: serviceId! };
}

export async function editSkuCostAndPriceThroughUi(page: Page, skuId: string, options?: {
  cost?: string;
  price?: string;
}) {
  await navigateHashRoute(page, `/catalog/skus/${skuId}/edit`);
  await page.getByRole('textbox', { name: 'Supplier Cost per Unit' }).fill(options?.cost ?? '5.00');
  await page.getByRole('textbox', { name: 'Customer Selling Price' }).fill(options?.price ?? '13.50');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.waitForFunction(
    (id) => window.location.hash === `#/catalog/skus/${id}`,
    skuId,
  );
}

export async function saveStockCountThroughUi(page: Page, skuId: string, units = '7') {
  await navigateHashRoute(page, `/work/capture/stock-count?skus=${encodeURIComponent(skuId)}`);
  const tile = page.locator('[data-slot="workbench-tile-visual"]').first();
  await tile.waitFor({ state: 'visible', timeout: 30_000 });
  await tile.click();
  const dialog = page.getByRole('dialog').first();
  await dialog.getByRole('textbox', { name: 'Units in stock' }).fill(units);
  await dialog.getByRole('button', { name: 'Done' }).click();
  const doneButton = page.getByRole('button', { name: /^Done$/ }).last();
  await expect(doneButton).toBeEnabled();
  await doneButton.click();
  const reviewDialog = page.getByRole('dialog', { name: 'Review update' });
  await reviewDialog.waitFor({ state: 'visible', timeout: 30_000 });
  await reviewDialog.getByRole('button', { name: 'Confirm save' }).click();
  await reviewDialog.waitFor({ state: 'hidden', timeout: 30_000 });
  await page.waitForFunction(() => window.kaurKhorDesktop.sena.listObservations().then((observations) => observations.length > 0));
}

export async function saveCustomerOrderThroughUi(page: Page, options: {
  expectedArrivalDate?: string;
  quantity?: string;
  targetId: string;
  targetName: string;
  targetType: 'service' | 'sku';
}) {
  await navigateHashRoute(
    page,
    `/work/capture/customer-order?targetAction=customer-order&targetType=${options.targetType}&targetId=${encodeURIComponent(options.targetId)}&ticketMode=new`,
  );
  await addPosLineThroughUi(page, options.targetName, options.quantity ?? '2');
  await fillPosExpectedArrivalDate(page, options.expectedArrivalDate ?? defaultFutureDateInput(7));
  await confirmPosMutationThroughUi(page);
  await navigateHashRoute(page, options.targetType === 'service' ? `/catalog/services/${options.targetId}` : `/catalog/skus/${options.targetId}`);
}

export async function saveImmediateSaleThroughUi(page: Page, options: {
  quantity?: string;
  targetId: string;
  targetName: string;
  targetType: 'service' | 'sku';
}) {
  await navigateHashRoute(
    page,
    `/work/capture/immediate-sale?targetAction=immediate-sale&targetType=${options.targetType}&targetId=${encodeURIComponent(options.targetId)}&ticketMode=new`,
  );
  await addPosLineThroughUi(page, options.targetName, options.quantity ?? '1');
  await confirmPosMutationThroughUi(page);
  await navigateHashRoute(page, options.targetType === 'service' ? `/catalog/services/${options.targetId}` : `/catalog/skus/${options.targetId}`);
}

export async function saveSupplierOrderThroughUi(page: Page, options: {
  expectedArrivalDate?: string;
  quantity?: string;
  skuId: string;
  skuName: string;
}) {
  await navigateHashRoute(
    page,
    `/work/capture/supplier-order?targetAction=supplier-order&targetType=sku&targetId=${encodeURIComponent(options.skuId)}&ticketMode=new`,
  );
  await addPosLineThroughUi(page, options.skuName, options.quantity ?? '5');
  await fillPosExpectedArrivalDate(page, options.expectedArrivalDate ?? defaultFutureDateInput(10));
  await confirmPosMutationThroughUi(page);
  await navigateHashRoute(page, `/catalog/skus/${options.skuId}`);
}

export async function assertDesktopBridgeConsistent(page: Page, options: {
  expectedTicket?: TicketExpectation;
  minObservationCount: number;
  minOrderBatchCount?: number;
  requireDetailRead?: boolean;
  skuId?: string;
  serviceId?: string;
}) {
  const bridgeState = await page.evaluate(async ({ expectedTicket, serviceId, skuId }) => {
    const [catalog, observations, orderBatches, summary, skuDetail, serviceDetail] = await Promise.all([
      window.kaurKhorDesktop.sena.getCatalog(),
      window.kaurKhorDesktop.sena.listObservations(),
      window.kaurKhorDesktop.sena.listOrderBatches(),
      window.kaurKhorDesktop.sena.getWorkspaceSummary(),
      skuId ? window.kaurKhorDesktop.sena.getSkuDetail({ skuId }) : Promise.resolve(null),
      serviceId ? window.kaurKhorDesktop.sena.getServiceDetail({ serviceId }) : Promise.resolve(null),
    ]);
    const ticketEvents = observations.flatMap((observation) => observation.input.ticketEvents ?? []);
    const matchingTicket = expectedTicket
      ? ticketEvents.find((event) => {
          const hasLine = !expectedTicket.entityId || event.lines.some((line) =>
            line.entityId === expectedTicket.entityId &&
            (expectedTicket.minQuantityDelta == null || Math.abs(line.quantityDelta ?? line.orderedQuantity ?? line.receivedQuantity ?? 0) >= expectedTicket.minQuantityDelta)
          );
          return hasLine &&
            (!expectedTicket.eventType || event.eventType === expectedTicket.eventType) &&
            (!expectedTicket.family || event.ticketFamily === expectedTicket.family) &&
            (!expectedTicket.stage || event.stage === expectedTicket.stage);
        })
      : null;

    return {
      hasExpectedTicket: expectedTicket ? Boolean(matchingTicket) : true,
      hasServiceDetail: serviceId ? Boolean(serviceDetail) : true,
      hasServiceInCatalog: serviceId ? Boolean(catalog?.services.some((entry) => entry.serviceId === serviceId)) : true,
      hasSkuDetail: skuId ? Boolean(skuDetail) : true,
      hasSkuInCatalog: skuId ? Boolean(catalog?.skus.some((entry) => entry.skuId === skuId)) : true,
      observationCount: observations.length,
      orderBatchCount: orderBatches.length,
      summaryIntervalCount: summary?.intervalCount ?? 0,
      ticketEventCount: ticketEvents.length,
    };
  }, options);

  expect(bridgeState.hasSkuInCatalog, 'SKU should be present in catalog bridge state after mutation').toBe(true);
  expect(bridgeState.hasServiceInCatalog, 'service should be present in catalog bridge state after mutation').toBe(true);
  if (options.requireDetailRead) {
    expect(bridgeState.hasSkuDetail, 'SKU detail should agree with catalog after observation-backed mutation').toBe(true);
    expect(bridgeState.hasServiceDetail, 'service detail should agree with catalog after observation-backed mutation').toBe(true);
  }
  expect(bridgeState.observationCount, 'observation bridge count should include saved mutation').toBeGreaterThanOrEqual(options.minObservationCount);
  expect(bridgeState.summaryIntervalCount, 'workspace summary should not lag saved observations').toBeGreaterThanOrEqual(options.minObservationCount);
  expect(bridgeState.orderBatchCount, 'order batch bridge count should not regress').toBeGreaterThanOrEqual(options.minOrderBatchCount ?? 0);
  expect(bridgeState.hasExpectedTicket, 'ticket event bridge state should include the saved UI mutation').toBe(true);
}

async function addPosLineThroughUi(page: Page, targetName: string, quantity: string) {
  const dialog = page.getByRole('dialog', { name: targetName });
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  await dialog.getByLabel(`Quantity for ${targetName}`).fill(quantity);
  await dialog.getByRole('button', { name: /Add line|Update line/ }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
  await expect(page.getByText(targetName, { exact: false }).first()).toBeVisible();
}

async function confirmPosMutationThroughUi(page: Page) {
  const previousObservationCount = await page.evaluate(() =>
    window.kaurKhorDesktop.sena.listObservations().then((observations) => observations.length)
  );
  await page.getByRole('button', { name: /^Done$/ }).first().click();
  const reviewDialog = page.getByRole('dialog', { name: 'Confirm receipt' });
  await reviewDialog.waitFor({ state: 'visible', timeout: 30_000 });
  const confirmButton = reviewDialog.getByRole('button', { name: 'Confirm save' });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.scrollIntoViewIfNeeded();
  await confirmButton.click();
  if (await confirmButton.isVisible().catch(() => false)) {
    await page.waitForTimeout(500);
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click({ force: true });
    }
  }
  await page.waitForFunction(
    (count) => window.kaurKhorDesktop.sena.listObservations().then((observations) => observations.length > count),
    previousObservationCount,
    { timeout: 60_000 },
  );
  if (await reviewDialog.isVisible().catch(() => false)) {
    await reviewDialog.getByRole('button', { name: 'Cancel' }).click();
  }
  await reviewDialog.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  await leaveRecordUpdateSessionIfNeeded(page);
}

async function fillPosExpectedArrivalDate(page: Page, expectedArrivalDate: string) {
  await page.getByRole('button', { name: /^Timing/ }).click();
  const metadataDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Observed at' }) });
  await metadataDialog.getByLabel('Expected date of arrival').fill(expectedArrivalDate);
  await metadataDialog.getByRole('combobox', { name: 'ETA variation' }).click();
  await page.getByRole('option', { name: /^Tight\b/i }).click();
  await page.keyboard.press('Escape');
  await expect(metadataDialog).toBeHidden();
}

function defaultFutureDateInput(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

async function leaveRecordUpdateSessionIfNeeded(page: Page) {
  const leaveButton = page.getByRole('button', { name: 'Discard changes and leave' });
  if (!(await leaveButton.isVisible().catch(() => false))) {
    return;
  }

  const clicked = await leaveButton.click({ force: true, timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    return;
  }
  const leaveDialog = page.getByRole('dialog', { name: 'Leave record update?' });
  const dialogOpened = await leaveDialog.waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!dialogOpened) {
    return;
  }
  await leaveDialog.getByRole('button', { name: 'Discard changes' }).click();
  await leaveDialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}
