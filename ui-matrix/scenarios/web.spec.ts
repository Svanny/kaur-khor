import { expect, test } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { captureUi, scrollMainSurface } from '../helpers/runtime-guards';
import { createSkuThroughUi } from '../helpers/forms';
import {
  assertEmbeddedUiStable,
  browserWorkspaceCounts,
  completeEmbeddedOnboardingIfPresent,
  exportEmbeddedBackup,
  expectEmbeddedBannerControls,
  importEmbeddedBackup,
  openEmbeddedRoute,
  prepareWebPage,
  resetEmbeddedWorkspace,
  resetEmbeddedWorkspaceThroughUi,
} from '../helpers/web';

test.describe('UI matrix: browser and demo surfaces', () => {
  test('demo browser mode exposes generated state, banner controls, and major routes', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'web-demo-and-browser-parity')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await page.goto('/kaur-khor/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Start Quick Demo' }).click();
    await page.waitForURL(/\/kaur-khor\/demo#\/onboarding$/);
    await expectEmbeddedBannerControls(page, 'demo');
    await assertEmbeddedUiStable(page, 'demo browser landing entry');
    await captureUi(page, testInfo, 'web-demo-landing-entry');

    await openEmbeddedRoute(page, 'demo', '/');
    await expectEmbeddedBannerControls(page, 'demo');
    const demoDownload = await exportEmbeddedBackup(page);
    expect(demoDownload.suggestedFilename()).toContain('kaur-khor-demo-backup');
    await resetEmbeddedWorkspaceThroughUi(page, 'demo');
    await expectEmbeddedBannerControls(page, 'demo');
    await resetEmbeddedWorkspace(page);
    prepared.issues.clear();
    await expectEmbeddedBannerControls(page, 'demo');
    await completeEmbeddedOnboardingIfPresent(page);
    await expect(page.locator('main a[href="#/insights/inventory"]')).toHaveCount(1);
    await expect(page.locator('main a[href="#/insights"]')).toHaveCount(0);
    await assertEmbeddedUiStable(page, 'demo browser home');
    await captureUi(page, testInfo, 'web-demo-home');

    await page.evaluate(() => {
      window.location.hash = '#/catalog';
    });
    await page.waitForFunction(() => window.location.hash === '#/catalog');
    await expect(page.getByRole('link', { name: /ក្រមាភ្នំពេញ|Phnom Penh|Krama/i }).first()).toBeVisible();
    await scrollMainSurface(page);
    await assertEmbeddedUiStable(page, 'demo browser catalog');
    await captureUi(page, testInfo, 'web-demo-catalog');

    await page.evaluate(() => {
      window.location.hash = '#/work/queue';
    });
    await page.waitForFunction(() => window.location.hash === '#/work/queue');
    await assertEmbeddedUiStable(page, 'demo browser work queue');
    await captureUi(page, testInfo, 'web-demo-work-queue');

    const populatedRoutes: Array<{ capture: string; route: string; text: RegExp | string }> = [
      { route: '#/insights/inventory', text: /Inventory|Inventory analysis/i, capture: 'web-demo-inventory' },
      { route: '#/insights/money', text: /Money/i, capture: 'web-demo-money' },
      { route: '#/insights/explain', text: /Explain/i, capture: 'web-demo-explain' },
      { route: '#/settings/history?view=all', text: /History|Saved updates/i, capture: 'web-demo-history' },
    ];
    for (const route of populatedRoutes) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route.route);
      await page.waitForFunction((hash) => window.location.hash === hash, route.route);
      await expect(page.getByText(route.text).first()).toBeVisible();
      await scrollMainSurface(page);
      await assertEmbeddedUiStable(page, `demo browser populated route ${route.route}`);
      await captureUi(page, testInfo, route.capture);
    }

    prepared.issues.assertNoIssues('demo browser matrix');
  });

  test('browser app mode keeps local-first controls and persists navigation across reload', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'browser-app-fresh-empty-workspace')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await openEmbeddedRoute(page, 'app', '/onboarding');
    await expectEmbeddedBannerControls(page, 'app');
    await assertEmbeddedUiStable(page, 'browser app onboarding');
    await captureUi(page, testInfo, 'web-app-onboarding');

    await completeEmbeddedOnboardingIfPresent(page);
    await expectEmbeddedBannerControls(page, 'app');
    const emptyCounts = await browserWorkspaceCounts(page);
    expect(emptyCounts).toMatchObject({
      observationCount: 0,
      serviceCount: 0,
      skuCount: 0,
    });
    await assertEmbeddedUiStable(page, 'browser app home after onboarding');
    await captureUi(page, testInfo, 'web-app-home');

    for (const route of ['#/work/queue', '#/catalog/skus/new', '#/settings/local-data'] as const) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route);
      await page.waitForFunction((hash) => window.location.hash === hash, route);
      await expectEmbeddedBannerControls(page, 'app');
      await scrollMainSurface(page);
      await assertEmbeddedUiStable(page, `browser app fresh route ${route}`);
    }

    const sku = await createSkuThroughUi(page, {
      cost: '3.25',
      name: 'Browser Matrix Tamarind Jar',
      price: '11.75',
      supplier: 'Browser Matrix Supplier',
    });
    await expect(page.getByRole('heading', { name: sku.name, exact: true })).toBeVisible();
    await assertEmbeddedUiStable(page, 'browser app SKU created');
    await captureUi(page, testInfo, 'web-app-sku-created');

    await page.evaluate(() => {
      window.location.hash = '#/work/queue';
    });
    await page.waitForFunction(() => window.location.hash === '#/work/queue');
    await page.evaluate((skuId) => {
      window.location.hash = `#/catalog/skus/${skuId}`;
    }, sku.skuId);
    await page.waitForFunction((skuId) => window.location.hash === `#/catalog/skus/${skuId}`, sku.skuId);
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction((skuId) => window.location.hash === `#/catalog/skus/${skuId}`, sku.skuId);
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();

    const backup = await exportEmbeddedBackup(page);
    const backupPath = testInfo.outputPath('web-app-browser-backup.json');
    await backup.saveAs(backupPath);
    const countsAfterMutation = await browserWorkspaceCounts(page);
    expect(countsAfterMutation.skuCount, 'browser app SKU should be saved before backup').toBeGreaterThan(0);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Reset this browser workspace?');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Reset workspace' }).first().click();
    await expect(page.getByText(sku.name, { exact: false }).first()).toBeVisible();
    const countsAfterResetCancel = await browserWorkspaceCounts(page);
    expect(countsAfterResetCancel.skuCount, 'canceling browser app reset should preserve created SKU state').toBe(countsAfterMutation.skuCount);

    await resetEmbeddedWorkspaceThroughUi(page, 'app');
    await completeEmbeddedOnboardingIfPresent(page);
    await expectEmbeddedBannerControls(page, 'app');
    const countsAfterReset = await browserWorkspaceCounts(page);
    expect(countsAfterReset.skuCount, 'browser app reset should clear created SKU state').toBe(0);

    await importEmbeddedBackup(page, backupPath);
    await page.waitForFunction((name) =>
      window.kaurKhorDesktop?.sena?.getCatalog()
        .then((catalog) => Boolean(catalog?.skus.some((sku) => sku.name === name)))
        .catch(() => false) ?? false,
    sku.name);
    await expectEmbeddedBannerControls(page, 'app');

    await page.evaluate(() => {
      window.location.hash = '#/settings/local-data';
    });
    await page.waitForFunction(() => window.location.hash === '#/settings/local-data');
    await expect(page.getByText(/OPFS|browser profile/i).first()).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.hash === '#/settings/local-data');
    await expectEmbeddedBannerControls(page, 'app');
    await assertEmbeddedUiStable(page, 'browser app local data after reload');
    await captureUi(page, testInfo, 'web-app-local-data-after-reload');
    prepared.issues.assertNoIssues('browser app matrix');
  });
});
