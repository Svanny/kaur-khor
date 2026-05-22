import { expect, test } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { captureUi, scrollMainSurface } from '../helpers/runtime-guards';
import {
  assertEmbeddedUiStable,
  browserWorkspaceCounts,
  completeEmbeddedOnboardingIfPresent,
  expectEmbeddedBannerControls,
  exportEmbeddedBackup,
  exportEmbeddedBackupPath,
  importEmbeddedBackup,
  openEmbeddedRoute,
  prepareWebPage,
  resetEmbeddedWorkspaceThroughUi,
} from '../helpers/web';
import { createSkuThroughUi } from '../helpers/forms';

function phoneCaptureMenuLink(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name })).first();
}

async function expectSharedPhoneCaptureHeader(page: import('@playwright/test').Page) {
  await expect(page.getByRole('banner').getByRole('link', { name: 'Back' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Capture actions' })).toBeVisible();
}

async function seedFullCaptureDraft(page: import('@playwright/test').Page, laneId: string) {
  await page.evaluate((id) => {
    window.localStorage.setItem(`kaur-khor:record-update:draft:${id}:v1`, JSON.stringify({
      currentStepId: 'stock',
      customSelectedLaneIds: [],
      notes: 'UI matrix full capture draft',
      observedAt: '2026-05-19T09:00',
      posTouchedLineKeys: [],
      rows: [],
      savedAt: '2026-05-19T09:00:00.000Z',
      touchedPosMetadataPopupIds: [],
      unlockedStepCount: 1,
      version: 1,
    }));
  }, laneId);
}

async function chooseNewCaptureTicketIfPrompted(page: import('@playwright/test').Page) {
  const prompt = page.getByRole('dialog').filter({ hasText: 'What do you want to do?' });
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.getByRole('button', { name: 'New' }).click();
  }
}

async function returnToPhoneCaptureMenu(page: import('@playwright/test').Page) {
  const headerBack = page.getByRole('banner').getByRole('link', { name: 'Back' });
  if (await headerBack.isVisible().catch(() => false)) {
    await headerBack.click();
  } else {
    const reducedNav = page.locator('[data-slot="phone-capture-reduced-nav"]');
    if (await reducedNav.isVisible().catch(() => false)) {
      await reducedNav.getByRole('link', { name: 'Close capture' }).click();
    } else {
      const phoneNav = page.getByRole('navigation', { name: 'Phone navigation' });
      await phoneNav.getByRole('link', { name: 'Capture' }).click();
    }
  }
  const leaveDialog = page.getByRole('dialog').filter({ hasText: 'Leave record update?' });
  if (await leaveDialog.isVisible().catch(() => false)) {
    await leaveDialog.getByRole('button', { name: 'Discard changes' }).click();
  }
  await expect(phoneCaptureMenuLink(page, 'Products Update')).toBeVisible();
}

test.describe('UI matrix: mobile and responsive embedded layouts', () => {
  test('required phone viewport sizes keep the operator shell stable', async ({ page }, testInfo) => {
    const requiredViewports = [
      { width: 360, height: 740 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 414, height: 896 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
    ];
    const prepared = await prepareWebPage(page);

    for (const viewport of requiredViewports) {
      await page.setViewportSize(viewport);
      await openEmbeddedRoute(page, 'demo', '/');
      await completeEmbeddedOnboardingIfPresent(page);
      const phoneShell = page.locator('[data-slot="embedded-phone-shell"]');
      if (await phoneShell.isVisible().catch(() => false)) {
        await expect(phoneShell).toBeVisible();
        const phoneNav = page.getByRole('navigation', { name: 'Phone navigation' });
        await expect(phoneNav).toBeVisible();
        await expect(phoneNav.getByRole('link', { name: 'Capture', exact: true })).toBeVisible();
      } else {
        await expect(page.locator('[data-slot="embedded-auto-zoom-viewport"]')).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'Rotate screen' })).toHaveCount(0);
      }
      await assertEmbeddedUiStable(page, `required phone viewport ${viewport.width}x${viewport.height}`);
      await captureUi(page, testInfo, `mobile-required-${viewport.width}x${viewport.height}`);
    }

    prepared.issues.assertNoIssues('mobile required viewport matrix');
  });

  test('phone portrait shows stable operator shell without exposing cramped desktop shell', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'mobile-responsive-embedded-layouts')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openEmbeddedRoute(page, 'demo', '/');
    await expect(page.getByRole('dialog', { name: 'Rotate screen' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Set up Kaur Khor' })).toBeVisible();
    await assertEmbeddedUiStable(page, 'phone portrait first-run setup');
    await captureUi(page, testInfo, 'mobile-phone-portrait-setup');
    await completeEmbeddedOnboardingIfPresent(page);
    await expect(page.locator('[data-slot="embedded-phone-shell"]')).toBeVisible();
    const phoneNav = page.getByRole('navigation', { name: 'Phone navigation' });
    await expect(phoneNav).toBeVisible();
    await expect(page.locator('[data-slot="phone-today-page"]')).toBeVisible();
    await expect(phoneNav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    await assertEmbeddedUiStable(page, 'phone portrait operator shell');
    await captureUi(page, testInfo, 'mobile-phone-portrait-shell');

    await phoneNav.getByRole('link', { name: 'Settings' }).click();
    await expect(page.locator('[data-slot="phone-more-page"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-workspace-safety"]')).toBeVisible();
    const phoneBackup = await exportEmbeddedBackup(page);
    expect(await phoneBackup.path(), 'phone portrait backup export should produce a local test artifact').not.toBeNull();
    await assertEmbeddedUiStable(page, 'phone portrait workspace safety');
    await captureUi(page, testInfo, 'mobile-phone-portrait-more-safety');

    await phoneNav.getByRole('link', { name: 'Products' }).click();
    await expect(page.locator('[data-slot="phone-products-page"]')).toBeVisible();
    await page.locator('[data-slot="phone-list-item"][href="#/catalog/skus/sku-001"]').click();
    await expect(page.locator('[data-slot="phone-product-detail-page"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-product-detail-summary"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-sku-services-section"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-product-actions"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Products Update' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Supplier Order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer Order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Immediate Sale' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to products' })).toBeVisible();
    await seedFullCaptureDraft(page, 'supplier-order-pending');
    await page.getByRole('button', { name: 'Supplier Order' }).click();
    await expect(page.getByRole('dialog')).toContainText('Delete saved draft?');
    await page.getByRole('button', { name: 'Delete draft and start new' }).click();
    await expect(page.getByRole('heading', { name: 'Supplier Order' })).toBeVisible();
    await expect(
      page.evaluate(() => window.localStorage.getItem('kaur-khor:record-update:draft:supplier-order-pending:v1')),
      'phone detail targeted capture should clear an existing full capture draft when requested',
    ).resolves.toBeNull();
    await returnToPhoneCaptureMenu(page);
    await phoneNav.getByRole('link', { name: 'Products' }).click();
    await page.locator('[data-slot="phone-list-item"][href="#/catalog/skus/sku-001"]').click();
    await expect(page.locator('[data-slot="phone-product-detail-page"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to products' })).toBeVisible();
    await assertEmbeddedUiStable(page, 'phone portrait product detail');
    await captureUi(page, testInfo, 'mobile-phone-portrait-product-detail');
    await page.getByRole('link', { name: 'Back to products' }).click();
    await expect(page.locator('[data-slot="phone-products-page"]')).toBeVisible();
    await page.locator('[data-slot="phone-list-item"][href="#/catalog/services/service-001"]').click();
    await expect(page.locator('[data-slot="phone-product-detail-page"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-product-detail-summary"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-product-actions"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open bottleneck SKU' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Products Update' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Customer Order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Immediate Sale' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to products' })).toBeVisible();
    await assertEmbeddedUiStable(page, 'phone portrait service detail');
    await captureUi(page, testInfo, 'mobile-phone-portrait-service-detail');

    await phoneNav.getByRole('link', { name: 'Capture' }).click();
    await expect(phoneCaptureMenuLink(page, 'Products Update')).toBeVisible();
    await expect(phoneCaptureMenuLink(page, 'Supplier Order')).toBeVisible();
    await expect(phoneCaptureMenuLink(page, 'Immediate Sale')).toBeVisible();
    await expect(phoneCaptureMenuLink(page, 'Customer Order')).toBeVisible();
    await assertEmbeddedUiStable(page, 'phone portrait capture menu');
    await captureUi(page, testInfo, 'mobile-phone-portrait-capture-menu');
    await phoneCaptureMenuLink(page, 'Products Update').click();
    await expect(page.getByRole('heading', { name: 'Products Update' })).toBeVisible();
    await expectSharedPhoneCaptureHeader(page);
    await expect(page.getByRole('heading', { name: 'Command home' })).toHaveCount(0);
    await expect(page.locator('[data-slot="phone-capture-surface"]')).toHaveCount(0);
    await captureUi(page, testInfo, 'mobile-phone-portrait-stock-count');
    await returnToPhoneCaptureMenu(page);
    await phoneCaptureMenuLink(page, 'Supplier Order').click();
    await chooseNewCaptureTicketIfPrompted(page);
    await expect(page.getByRole('heading', { name: 'Supplier Order' })).toBeVisible();
    await expectSharedPhoneCaptureHeader(page);
    await captureUi(page, testInfo, 'mobile-phone-portrait-supplier-order');
    await returnToPhoneCaptureMenu(page);
    await phoneCaptureMenuLink(page, 'Immediate Sale').click();
    await chooseNewCaptureTicketIfPrompted(page);
    await expect(page.getByRole('heading', { name: 'Immediate Sale' })).toBeVisible();
    await expectSharedPhoneCaptureHeader(page);
    await captureUi(page, testInfo, 'mobile-phone-portrait-immediate-sale');
    await returnToPhoneCaptureMenu(page);
    await phoneCaptureMenuLink(page, 'Customer Order').click();
    await chooseNewCaptureTicketIfPrompted(page);
    await expect(page.getByRole('heading', { name: 'Customer Order' })).toBeVisible();
    await expectSharedPhoneCaptureHeader(page);
    await captureUi(page, testInfo, 'mobile-phone-portrait-customer-order');
    await returnToPhoneCaptureMenu(page);

    await page.evaluate(() => {
      window.location.hash = '#/insights';
    });
    await page.waitForFunction(() => window.location.hash === '#/insights');
    await expect(page.locator('[data-slot="phone-insights-page"]')).toBeVisible();
    await page.getByRole('link', { name: 'Inventory' }).click();
    await expect(page.locator('[data-slot="phone-inventory-strip"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-inventory-focus-list"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-inventory-projection-preview"]')).toBeVisible();
    await captureUi(page, testInfo, 'mobile-phone-portrait-inventory-insight');
    await page.getByRole('link', { name: 'Back to insights' }).click();
    await page.getByRole('link', { name: 'Money' }).click();
    await expect(page.locator('[data-slot="phone-money-ribbon"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-money-statement"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-money-contributors"]')).toBeVisible();
    await captureUi(page, testInfo, 'mobile-phone-portrait-money-insight');
    await page.getByRole('link', { name: 'Back to insights' }).click();
    await page.getByRole('link', { name: 'Explain' }).click();
    await expect(page.locator('[data-slot="phone-explain-posture"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-explain-evidence-freshness"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-explain-fragile-list"]')).toBeVisible();
    await captureUi(page, testInfo, 'mobile-phone-portrait-explain-insight');
    prepared.issues.assertNoIssues('mobile phone portrait matrix');
  });

  test('fresh tablet browser app empty state survives resize and route changes', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'mobile-fresh-empty-responsive-layouts')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await page.setViewportSize({ width: 900, height: 700 });
    await openEmbeddedRoute(page, 'app', '/onboarding');
    await expectEmbeddedBannerControls(page, 'app');
    await completeEmbeddedOnboardingIfPresent(page);
    const emptyCounts = await browserWorkspaceCounts(page);
    expect(emptyCounts).toMatchObject({
      observationCount: 0,
      serviceCount: 0,
      skuCount: 0,
    });
    await assertEmbeddedUiStable(page, 'fresh tablet browser app home');
    await captureUi(page, testInfo, 'mobile-fresh-tablet-home');

    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => {
      window.location.hash = '#/work/queue';
    });
    await page.waitForFunction(() => window.location.hash === '#/work/queue');
    await expect(page.getByRole('heading', { name: 'Task queue' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search queue' })).toBeVisible();
    await assertEmbeddedUiStable(page, 'fresh tablet landscape work queue');
    await captureUi(page, testInfo, 'mobile-fresh-landscape-empty-work');
    prepared.issues.assertNoIssues('mobile fresh matrix');
  });

  test('phone landscape and tablet browser app keep controls stable through resize', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'mobile-dependent-browser-app-mutation')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await openEmbeddedRoute(page, 'demo', '/');
    await expect(page.getByRole('dialog', { name: 'Rotate screen' })).toHaveCount(0);
    await expectEmbeddedBannerControls(page, 'demo');
    await resetEmbeddedWorkspaceThroughUi(page, 'demo');
    await expectEmbeddedBannerControls(page, 'demo');
    await completeEmbeddedOnboardingIfPresent(page);
    await openEmbeddedRoute(page, 'demo', '/catalog');
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('ក្រមា');
    await expect(page.getByText(/ក្រមាភ្នំពេញ|Phnom Penh|Krama/i).first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Filter by supplier' }).click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.location.hash = '#/work/capture';
    });
    await page.waitForTimeout(500);
    await scrollMainSurface(page);
    await expectEmbeddedBannerControls(page, 'demo');
    await assertEmbeddedUiStable(page, 'phone landscape demo catalog capture and safety actions');
    await captureUi(page, testInfo, 'mobile-phone-landscape-demo');

    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(500);
    await openEmbeddedRoute(page, 'app', '/onboarding');
    await expectEmbeddedBannerControls(page, 'app');
    await completeEmbeddedOnboardingIfPresent(page);
    const sku = await createSkuThroughUi(page, {
      cost: '6.00',
      description: 'Tablet form interaction from the mobile UI matrix.',
      name: 'Tablet Matrix Pepper Tin',
      price: '14.00',
      supplier: 'Tablet Matrix Supplier',
    });
    await expect(page.getByRole('heading', { name: sku.name, exact: true })).toBeVisible();
    await scrollMainSurface(page);
    await assertEmbeddedUiStable(page, 'tablet browser app SKU created');
    await captureUi(page, testInfo, 'mobile-dependent-sku-created');

    await page.evaluate(() => {
      window.location.hash = '#/catalog';
    });
    await page.waitForFunction(() => window.location.hash === '#/catalog');
    await page.goBack();
    await page.waitForFunction((skuId) => window.location.hash === `#/catalog/skus/${skuId}`, sku.skuId);
    await page.goForward();
    await page.waitForFunction(() => window.location.hash === '#/catalog');
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    const countsAfterCreate = await browserWorkspaceCounts(page);
    expect(countsAfterCreate.skuCount).toBeGreaterThan(0);

    await openEmbeddedRoute(page, 'app', '/catalog');
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    await assertEmbeddedUiStable(page, 'tablet browser app SKU after reload');
    await captureUi(page, testInfo, 'mobile-dependent-after-reload');

    const backupPath = await exportEmbeddedBackupPath(page, testInfo, 'mobile-browser-app-backup');
    expect(backupPath, 'mobile browser app backup should be available as a local test artifact').not.toBe('');

    await resetEmbeddedWorkspaceThroughUi(page, 'app');
    await expectEmbeddedBannerControls(page, 'app');
    const countsAfterReset = await browserWorkspaceCounts(page);
    expect(countsAfterReset.skuCount).toBe(0);

    await importEmbeddedBackup(page, backupPath!);
    await expectEmbeddedBannerControls(page, 'app');
    await page.evaluate(() => {
      window.location.hash = '#/catalog';
    });
    await page.waitForFunction(() => window.location.hash === '#/catalog');
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    const countsAfterImport = await browserWorkspaceCounts(page);
    expect(countsAfterImport.skuCount).toBeGreaterThan(0);
    await assertEmbeddedUiStable(page, 'tablet browser app SKU after backup import');
    await captureUi(page, testInfo, 'mobile-dependent-after-backup-import');

    await page.setViewportSize({ width: 390, height: 844 });
    await openEmbeddedRoute(page, 'app', '/settings');
    await expect(page.locator('[data-slot="embedded-phone-shell"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-more-page"]')).toBeVisible();
    await expect(page.locator('[data-slot="phone-workspace-safety"]')).toBeVisible();
    const phoneAppBackup = await exportEmbeddedBackup(page);
    expect(await phoneAppBackup.path(), 'phone browser app backup should produce a local test artifact').not.toBeNull();
    await assertEmbeddedUiStable(page, 'phone browser app workspace safety');
    await captureUi(page, testInfo, 'mobile-dependent-phone-app-safety');

    await resetEmbeddedWorkspaceThroughUi(page, 'app');
    await expect(page.getByRole('heading', { name: 'Set up Kaur Khor' })).toBeVisible();
    await completeEmbeddedOnboardingIfPresent(page);
    await expect(page.locator('[data-slot="embedded-phone-shell"]')).toBeVisible();
    const countsAfterPhoneReset = await browserWorkspaceCounts(page);
    expect(countsAfterPhoneReset.skuCount).toBe(0);

    await openEmbeddedRoute(page, 'app', '/settings');
    await importEmbeddedBackup(page, backupPath!);
    await expect(page.locator('[data-slot="embedded-phone-shell"]')).toBeVisible();
    await openEmbeddedRoute(page, 'app', '/catalog');
    await expect(page.locator('[data-slot="phone-products-page"]')).toBeVisible();
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    await assertEmbeddedUiStable(page, 'phone browser app after backup import');
    await captureUi(page, testInfo, 'mobile-dependent-phone-after-backup-import');
    prepared.issues.assertNoIssues('mobile responsive matrix');
  });
});
