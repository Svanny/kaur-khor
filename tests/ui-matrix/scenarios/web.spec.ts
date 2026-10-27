import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { captureUi, scrollMainSurface } from '../helpers/runtime-guards';
import { createSkuThroughUi } from '../helpers/forms';
import {
  assertEmbeddedUiStable,
  browserWorkspaceCounts,
  completeEmbeddedOnboardingIfPresent,
  exportEmbeddedBackup,
  exportEmbeddedBackupPath,
  expectEmbeddedBannerControls,
  importEmbeddedBackup,
  openEmbeddedRoute,
  prepareWebPage,
  resetEmbeddedWorkspace,
  resetEmbeddedWorkspaceThroughUi,
} from '../helpers/web';

test.describe('UI matrix: browser and demo surfaces', () => {
  test('backup import waits for the reloaded browser bridge before reading counts', async ({ page }, testInfo) => {
    await page.route('**/kaur-khor/bridge-readiness-fixture', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body>
        <input type="file" accept="application/json" onchange="document.querySelector('[role=dialog]').hidden = false">
        <div role="dialog" aria-label="Replace this browser workspace?" hidden>
          <button onclick="location.reload()">Replace workspace</button>
        </div>
        <script>
          const loads = Number(sessionStorage.getItem('fixture-loads') || 0) + 1;
          sessionStorage.setItem('fixture-loads', String(loads));
          document.documentElement.dataset.fixtureLoads = String(loads);
          setTimeout(() => {
            window.kaurKhorDesktop = { sena: {
              getCatalog: async () => ({ skus: [{}], services: [{}] }),
              listObservations: async () => [{}],
            } };
          }, 2000);
        </script>
      </body></html>`,
    }));
    await page.goto('/kaur-khor/bridge-readiness-fixture', { waitUntil: 'domcontentloaded' });
    const backupPath = testInfo.outputPath('bridge-readiness-backup.json');
    await writeFile(backupPath, '{}', 'utf8');

    await importEmbeddedBackup(page, backupPath);

    await expect(page.locator('html')).toHaveAttribute('data-fixture-loads', '2');
    expect(await browserWorkspaceCounts(page)).toEqual({ skuCount: 1, serviceCount: 1, observationCount: 1 });
  });

  test('navigation waits for delayed visual viewport measurements', async ({ page }, testInfo) => {
    const prepared = await prepareWebPage(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.addInitScript(() => {
      const visual = window.visualViewport;
      if (!visual) throw new Error('Visual viewport is required for this regression.');
      Object.defineProperty(visual, 'width', { configurable: true, get: () => 430 });
      document.addEventListener('kaur-khor:embedded-viewport-change', () => {
        const viewport = document.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
        document.documentElement.dataset.uiMatrixInitialArea = viewport?.getAttribute('data-measured-area') ?? '';
        setTimeout(() => {
          Reflect.deleteProperty(visual, 'width');
          visual.dispatchEvent(new Event('resize'));
        }, 1500);
      }, { capture: true, once: true });
    });

    await openEmbeddedRoute(page, 'demo');

    expect(await page.locator('html').getAttribute('data-ui-matrix-initial-area')).toBe(String(430 * 1024));
    const viewport = page.locator('[data-slot="embedded-auto-zoom-viewport"]');
    expect(await viewport.getAttribute('data-measured-area')).toBe(String(768 * 1024));
    await expect(viewport).toHaveAttribute('data-phone-portrait', 'false');
    await expect(page.locator('[data-slot="embedded-phone-shell"]')).toHaveCount(0);
    await assertEmbeddedUiStable(page, 'desktop shell after delayed phone-to-tablet measurement');
    await captureUi(page, testInfo, 'web-delayed-viewport-ready');
    prepared.issues.assertNoIssues('delayed responsive viewport readiness');
  });

  test('demo browser mode opens a blank isolated workspace with banner controls and major routes', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'web-demo-and-browser-parity')?.expectedUi ?? '',
    });
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'web-landing-primary-release-actions')?.expectedUi ?? '',
    });

    const prepared = await prepareWebPage(page);
    await page.goto('/kaur-khor/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Get started/i })).toHaveClass(/pos-metadata-surface-gleam/);
    const releaseSelector = page.getByLabel('Download');
    if (await releaseSelector.count()) {
      const releaseSelectorBox = await releaseSelector.boundingBox();
      expect(releaseSelectorBox?.width, 'release selector should have enough rendered width for long asset labels').toBeGreaterThan(430);
    }
    const selectedDownload = page.getByRole('link', { name: /Download selected/i });
    if (await selectedDownload.count()) {
      await expect(selectedDownload.first()).toHaveClass(/pos-metadata-surface-gleam/);
    }
    await captureUi(page, testInfo, 'web-landing-entry');
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
    const demoCounts = await browserWorkspaceCounts(page);
    expect(demoCounts).toMatchObject({
      observationCount: 0,
      serviceCount: 0,
      skuCount: 0,
    });
    await assertEmbeddedUiStable(page, 'demo browser home');
    await captureUi(page, testInfo, 'web-demo-home');

    await page.evaluate(() => {
      window.location.hash = '#/catalog';
    });
    await page.waitForFunction(() => window.location.hash.startsWith('#/catalog'));
    await expect(page.getByText('Set up products')).toBeVisible();
    await expect(page.getByText('No products loaded yet')).toBeVisible();
    await expect(await browserWorkspaceCounts(page)).toMatchObject({
      observationCount: 0,
      serviceCount: 0,
      skuCount: 0,
    });
    await scrollMainSurface(page);
    await assertEmbeddedUiStable(page, 'demo browser catalog');
    await captureUi(page, testInfo, 'web-demo-catalog');

    await page.evaluate(() => {
      window.location.hash = '#/work/queue';
    });
    await page.waitForFunction(() => window.location.hash === '#/work/queue');
    await expect(page.getByText('Work needs products first')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create first SKU' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Task queue' })).toHaveCount(0);
    await assertEmbeddedUiStable(page, 'demo browser work queue');
    await captureUi(page, testInfo, 'web-demo-work-queue');

    const blankRoutes: Array<{ capture: string; route: string; text: RegExp | string }> = [
      { route: '#/settings/local-data', text: /Local data|browser profile|backup/i, capture: 'web-demo-local-data' },
    ];
    for (const route of blankRoutes) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route.route);
      await page.waitForFunction((hash) => window.location.hash.startsWith(hash), route.route);
      await expect(page.getByText(route.text).first()).toBeVisible();
      await scrollMainSurface(page);
      await assertEmbeddedUiStable(page, `demo browser blank route ${route.route}`);
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
      if (route === '#/work/queue') {
        await expect(page.getByText('Work needs products first')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Create first SKU' })).toBeVisible();
      }
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
for (const surface of ['wide', 'phone'] as const) {
  test(`browser backup preview preserves ${surface} workspace until explicit replacement`, async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'ui-matrix', description: 'browser-backup-preview-and-cancellation' });
    const prepared = await prepareWebPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEmbeddedRoute(page, 'app');
    await completeEmbeddedOnboardingIfPresent(page);
    const emptyBackup = await exportEmbeddedBackupPath(page, testInfo, 'empty-workspace-backup');
    const sku = await createSkuThroughUi(page, { name: `Preserve ${surface} workspace` });
    const before = await browserWorkspaceCounts(page);
    expect(before.skuCount).toBe(1);
    const draftKey = 'kaur-khor:record-update:draft:stock-count:v1';
    const draft = JSON.stringify({ version: 1, notes: 'Keep this exact unsaved count draft' });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: draftKey, value: draft });

    if (surface === 'phone') {
      await page.setViewportSize({ width: 430, height: 932 });
      await page.getByRole('navigation', { name: 'Phone navigation' }).getByRole('link', { name: 'Settings' }).click();
      await expect(page.locator('[data-slot="phone-workspace-safety"]')).toBeVisible();
    }

    for (const closeWithEscape of [false, true]) {
      const urlBefore = page.url();
      const chooserWait = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import backup', exact: true }).first().click();
      await (await chooserWait).setFiles(emptyBackup);
      const dialog = page.getByRole('dialog', { name: 'Replace this browser workspace?' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('0 SKUs · 0 services · 0 updates');
      const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'Replace workspace', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();

      if (!closeWithEscape) {
        const downloadWait = page.waitForEvent('download');
        await dialog.getByRole('button', { name: 'Export backup', exact: true }).click();
        const currentBackup = testInfo.outputPath(`current-${surface}.json`);
        await (await downloadWait).saveAs(currentBackup);
        const exported = JSON.parse(await readFile(currentBackup, 'utf8'));
        const state = exported.records.find((record: { collection: string }) => record.collection === 'browser_state').json;
        expect(state.catalog.skus.map((item: { skuId: string }) => item.skuId)).toContain(sku.skuId);
        await expect(cancel).toBeEnabled();
        await captureUi(page, testInfo, `backup-preview-${surface}`);
        await cancel.click();
      } else {
        if (surface === 'phone') {
          await page.setViewportSize({ width: 932, height: 430 });
          await expect(page.locator('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-portrait', 'false');
          await expect(dialog).toBeVisible();
          const bounds = await dialog.boundingBox();
          expect(bounds!.y).toBeGreaterThanOrEqual(0);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(430);
          await captureUi(page, testInfo, 'backup-preview-phone-rotated');
        }
        await page.keyboard.press('Escape');
      }
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Import backup', exact: true }).first()).toBeFocused();
      if (!(surface === 'phone' && closeWithEscape)) expect(page.url()).toBe(urlBefore);
      expect(await browserWorkspaceCounts(page)).toEqual(before);
      expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
    }

    if (surface === 'phone') {
      // Rotation mounts the lazy desktop settings route. Finish that transition
      // before the deliberate import reload can cancel its dependency requests.
      await expect(page.locator('[data-slot="card-title"]').filter({ hasText: /^Preferences$/ })).toBeVisible();
    }
    prepared.issues.assertNoIssues(`backup preview ${surface} before deliberate reload`);
    await importEmbeddedBackup(page, emptyBackup);
    await expect(page.getByRole('button', { name: 'Export backup', exact: true }).first()).toBeEnabled();
    expect(await browserWorkspaceCounts(page)).toEqual({ skuCount: 0, serviceCount: 0, observationCount: 0 });
    prepared.issues.assertNoIssues(`backup preview ${surface} cancellation and explicit import`);
  });
}

test('unsaved product warnings keep keyboard actions inside the decision', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'ui-matrix', description: 'confirmation-keyboard-safety' });
  const prepared = await prepareWebPage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openEmbeddedRoute(page, 'app');
  await completeEmbeddedOnboardingIfPresent(page);
  await page.getByRole('link', { name: 'Create first SKU', exact: true }).click();
  const name = page.getByRole('textbox', { name: /^Name/ });
  await name.fill('Keep this unsaved product');
  const editorUrl = page.url();
  const back = page.getByRole('button', { name: 'Back', exact: true });
  for (const dismissWithEscape of [true, false]) {
    await back.click();
    const dialog = page.getByRole('dialog', { name: 'Discard changes?', exact: true });
    const keep = dialog.getByRole('button', { name: 'Keep editing', exact: true });
    const discard = dialog.getByRole('button', { name: 'Discard changes', exact: true });
    await expect(keep).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(discard).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(keep).toBeFocused();
    await captureUi(page, testInfo, 'unsaved-product-keyboard-confirmation');
    if (dismissWithEscape) await page.keyboard.press('Escape');
    else await keep.click();
    await expect(dialog).toHaveCount(0);
    await expect(back).toBeFocused();
    await expect(name).toHaveValue('Keep this unsaved product');
    expect(page.url()).toBe(editorUrl);
    expect(await browserWorkspaceCounts(page)).toEqual({ skuCount: 0, serviceCount: 0, observationCount: 0 });
  }
  await back.click();
  await page.getByRole('dialog', { name: 'Discard changes?', exact: true })
    .getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Create first SKU', exact: true })).toBeVisible();
  prepared.issues.assertNoIssues('unsaved product keyboard decision');
});

test('browser history preserves unsaved products until the operator decides', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'ui-matrix', description: 'unsaved-product-history-navigation' });
  const prepared = await prepareWebPage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openEmbeddedRoute(page, 'app');
  await completeEmbeddedOnboardingIfPresent(page);
  await page.getByRole('link', { name: 'Create first SKU', exact: true }).click();
  const name = page.getByRole('textbox', { name: /^Name/ });
  const editorUrl = page.url();
  const editorState = await page.evaluate(() => window.history.state);
  await name.fill('History must keep this draft');
  const dialog = page.getByRole('dialog', { name: 'Discard changes?', exact: true });
  for (const escape of [true, false]) {
    await page.goBack();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(editorUrl);
    await expect(dialog.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
    await captureUi(page, testInfo, 'unsaved-product-history-warning');
    if (escape) await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(name).toHaveValue('History must keep this draft');
    expect(await page.evaluate(() => window.history.state)).toEqual(editorState);
  }
  await page.goBack();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Create first SKU', exact: true })).toBeVisible();
  await page.goForward();
  await expect(name).toHaveValue('');
  expect(await page.evaluate(() => window.history.state)).toEqual(editorState);

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const settingsUrl = page.url();
  const settingsState = await page.evaluate(() => window.history.state);
  await page.goBack();
  await expect(name).toBeVisible();
  await name.fill('Forward must keep this draft too');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goForward();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(editorUrl);
    await page.keyboard.press('Escape');
    await expect(name).toHaveValue('Forward must keep this draft too');
    expect(await page.evaluate(() => window.history.state)).toEqual(editorState);
  }
  await page.goForward();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page).toHaveURL(settingsUrl);
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: /^Preferences$/ })).toBeVisible();
  expect(await page.evaluate(() => window.history.state)).toEqual(settingsState);
  expect(await browserWorkspaceCounts(page)).toEqual({ skuCount: 0, serviceCount: 0, observationCount: 0 });
  prepared.issues.assertNoIssues('unsaved product browser Back and Forward decisions');
});
