import { expect, test } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { captureUi, scrollMainSurface } from '../helpers/runtime-guards';
import {
  assertEmbeddedUiStable,
  browserWorkspaceCounts,
  completeEmbeddedOnboardingIfPresent,
  expectEmbeddedBannerControls,
  openEmbeddedRoute,
  prepareWebPage,
} from '../helpers/web';
import { createSkuThroughUi } from '../helpers/forms';

test.describe('UI matrix: mobile and responsive embedded layouts', () => {
  test('phone portrait shows stable rotate prompt without exposing cramped desktop shell', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'mobile-responsive-embedded-layouts')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openEmbeddedRoute(page, 'demo', '/');
    await expect(page.getByRole('dialog', { name: 'Rotate screen' })).toBeVisible();
    await expect(page.locator('[data-slot="embedded-phone-shell"]')).toHaveCount(0);
    await assertEmbeddedUiStable(page, 'phone portrait rotate prompt');
    await captureUi(page, testInfo, 'mobile-phone-portrait-rotate');
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
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
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
    await completeEmbeddedOnboardingIfPresent(page);
    await openEmbeddedRoute(page, 'demo', '/catalog');
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('krama');
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

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.hash === '#/catalog');
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    await assertEmbeddedUiStable(page, 'tablet browser app SKU after reload');
    await captureUi(page, testInfo, 'mobile-dependent-after-reload');
    prepared.issues.assertNoIssues('mobile responsive matrix');
  });
});
