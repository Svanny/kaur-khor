import { expect, test } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { captureUi, scrollMainSurface } from '../helpers/runtime-guards';
import {
  assertEmbeddedUiStable,
  completeEmbeddedOnboardingIfPresent,
  expectEmbeddedBannerControls,
  openEmbeddedRoute,
  prepareWebPage,
} from '../helpers/web';

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

  test('phone landscape and tablet browser app keep controls stable through resize', async ({ page }, testInfo) => {
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
    await page.evaluate(() => {
      window.location.hash = '#/catalog/skus/new';
    });
    await page.waitForTimeout(500);
    await page.getByLabel('Name').fill('Tablet Matrix Pepper Tin');
    await page.getByRole('combobox', { name: /^Supplier$/ }).click();
    await page.getByRole('option', { name: 'Custom supplier' }).click();
    await page.getByRole('textbox', { name: 'Custom supplier' }).fill('Tablet Matrix Supplier');
    await page.getByLabel('Description').fill('Tablet form interaction from the mobile UI matrix.');
    await page.getByRole('textbox', { name: 'Supplier Cost per Unit' }).fill('6.00');
    await page.getByRole('checkbox', { name: 'Sell as product' }).check();
    await page.getByRole('textbox', { name: 'Customer Selling Price' }).fill('14.00');
    await page.getByRole('combobox', { name: 'ETA variation' }).click();
    await page.keyboard.press('Escape');
    await scrollMainSurface(page);
    await assertEmbeddedUiStable(page, 'tablet browser app SKU form controls');
    await captureUi(page, testInfo, 'mobile-tablet-browser-app');
    prepared.issues.assertNoIssues('mobile responsive matrix');
  });
});
