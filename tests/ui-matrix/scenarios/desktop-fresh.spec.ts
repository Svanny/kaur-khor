import { expect, test, type Page } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { createSkuThroughUi } from '../helpers/forms';
import {
  closeDesktopUiMatrix,
  completeOnboardingThroughUi,
  desktopWorkspaceCounts,
  launchDesktopUiMatrix,
  saveAllVisibilityPreferences,
  resizeDesktopWindow,
} from '../helpers/desktop';
import {
  assertUiStable,
  captureUi,
  navigateHashRoute,
  scrollMainSurface,
  verifyBackForward,
} from '../helpers/runtime-guards';

const freshEmptyRoutes: Array<{
  assertion: (page: Page) => Promise<void>;
  capture: string;
  route: `/${string}`;
}> = [
  {
    route: '/',
    capture: 'fresh-home-empty',
    assertion: async (page) => {
      await expect(page.getByText('Command home')).toBeVisible();
      await expect(page.getByText('0 items')).toBeVisible();
      await expect(page.getByText('0 updates')).toBeVisible();
    },
  },
  {
    route: '/work',
    capture: 'fresh-work-empty',
    assertion: async (page) => {
      await expect(page.getByText('Daily operator work')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Queue' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Capture' })).toBeVisible();
    },
  },
  {
    route: '/work/queue',
    capture: 'fresh-work-queue-empty',
    assertion: async (page) => {
      await expect(page.getByText('Work needs products first')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Create first SKU' })).toBeVisible();
    },
  },
  {
    route: '/catalog/skus/new',
    capture: 'fresh-new-sku-form',
    assertion: async (page) => {
      await expect(page.getByRole('heading', { name: 'New SKU' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create entry' })).toBeVisible();
    },
  },
  {
    route: '/catalog/services/new',
    capture: 'fresh-new-service-form',
    assertion: async (page) => {
      await expect(page.getByRole('heading', { name: 'New service' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create entry' })).toBeVisible();
    },
  },
  {
    route: '/settings/help',
    capture: 'fresh-help',
    assertion: async (page) => {
      await expect(page.getByText('User Guide', { exact: true })).toBeVisible();
    },
  },
  {
    route: '/settings/interface',
    capture: 'fresh-settings-interface',
    assertion: async (page) => {
      await expect(page.getByText('Interface', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Maximal View')).toBeVisible();
    },
  },
  {
    route: '/settings/local-data',
    capture: 'fresh-local-data',
    assertion: async (page) => {
      await expect(page.getByText('Local data', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create backup snapshot' })).toBeVisible();
    },
  },
  {
    route: '/settings/automation',
    capture: 'fresh-automation-settings-empty',
    assertion: async (page) => {
      await expect(page.getByText(/Automated Telegram Bot|Automations and intake/).first()).toBeVisible();
    },
  },
  {
    route: '/insights',
    capture: 'fresh-insights-hub-empty',
    assertion: async (page) => {
      await expect(page.getByText('Understand what needs attention')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Inventory' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Money' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Explain' })).toBeVisible();
    },
  },
  {
    route: '/insights/inventory',
    capture: 'fresh-insights-inventory-empty',
    assertion: async (page) => {
      await expect(page.getByText('No inventory items yet.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Create first SKU' })).toBeVisible();
    },
  },
];

test.describe('UI matrix: desktop fresh state', () => {
  test('ticket chooser keeps keyboard navigation and interrupted drafts safe', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'desktop-ticket-chooser-keyboard')?.expectedUi ?? '',
    });
    const launched = await launchDesktopUiMatrix({ fresh: true, name: 'desktop-ticket-chooser', testInfo });
    const { page } = launched;
    try {
      if (process.platform === 'win32') {
        await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
      }
      await completeOnboardingThroughUi(page);
      await saveAllVisibilityPreferences(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const sku = await createSkuThroughUi(page, { name: 'Key item', supplier: 'Key supplier' });
      await page.evaluate(async (skuId) => {
        await window.kaurKhorDesktop.sena.createOrderBatch({
          supplierName: 'Keyboard Supplier',
          shared: { expectedArrivalAt: '2026-11-15T00:00:00.000Z', supplierNote: '' },
          children: [{ skuId, overrides: { orderedQuantity: 5 } }],
        });
      }, sku.skuId);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const lanes = [
        { title: 'Customer Order', id: 'customer-order-pending' },
        { title: 'Supplier Order', id: 'supplier-order-pending' },
        { title: 'Immediate Sale', id: 'customer-order-completed' },
      ];
      const drafts = await page.evaluate((entries) => entries.map(({ id }) => {
        const key = `kaur-khor:record-update:draft:${id}:v1`;
        const value = JSON.stringify({
          version: 1, currentStepId: 'stock', customSelectedLaneIds: [],
          notes: 'Interrupted keyboard workflow', observedAt: '2026-05-19T09:00',
          posTouchedLineKeys: [], rows: [], savedAt: '2026-05-19T09:00:00.000Z',
          touchedPosMetadataPopupIds: [], unlockedStepCount: 1,
        });
        localStorage.setItem(key, value);
        return { key, value };
      }), lanes);
      await navigateHashRoute(page, '/work/capture');
      const before = await desktopWorkspaceCounts(page);
      expect(before.orderBatchCount).toBe(1);
      for (const { title } of lanes) {
        const opener = page.getByRole('button', { name: title, exact: true });
        await opener.click();
        const dialog = page.getByRole('dialog', { name: title, exact: true });
        await expect(dialog.getByRole('button', { name: 'Resume draft', exact: true })).toBeFocused();
        for (let index = 0; index < 7; index += 1) {
          await page.keyboard.press(index === 6 ? 'Shift+Tab' : 'Tab');
          expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(opener).toBeFocused();
        await opener.press('Enter');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(opener).toBeFocused();
      }
      const supplier = page.getByRole('button', { name: 'Supplier Order', exact: true });
      await supplier.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Edit/Update', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Edit / update existing supplier order' });
      await expect(picker.getByRole('button').first()).toBeFocused();
      await captureUi(page, testInfo, 'ticket-picker-keyboard');
      await picker.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Resume draft' })).toBeFocused();
      await page.getByRole('dialog').getByRole('button', { name: 'New', exact: true }).click();
      const warning = page.getByRole('dialog', { name: 'Delete saved draft?' });
      await expect(warning.getByRole('button', { name: 'Keep draft', exact: true })).toBeFocused();
      await resizeDesktopWindow(launched, { width: 960, height: 760 });
      await assertUiStable(page, 'ticket draft warning at compact desktop size');
      await captureUi(page, testInfo, 'ticket-draft-safe-default');
      await page.keyboard.press('Escape');
      await expect(supplier).toBeFocused();
      await supplier.press('Enter');
      await page.getByRole('dialog').getByRole('button', { name: 'New', exact: true }).click();
      await warning.getByRole('button', { name: 'Keep draft', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Resume draft' })).toBeFocused();
      expect(await page.evaluate((entries) => entries.map(({ key }) => localStorage.getItem(key)), drafts))
        .toEqual(drafts.map(({ value }) => value));
      expect(await desktopWorkspaceCounts(page)).toEqual(before);
      await captureUi(page, testInfo, 'ticket-chooser-after-interruption');
      await page.getByRole('dialog').getByRole('button', { name: 'Resume draft', exact: true }).click();
      await expect(page).toHaveURL(/#\/work\/capture\/supplier-order$/);
      await assertUiStable(page, 'resumed supplier draft');
      launched.issues.assertNoIssues('ticket chooser repeated and interrupted keyboard workflow');
    } finally {
      await closeDesktopUiMatrix(launched);
    }
  });

  test('Home resumes product setup and leads directly to the first saved update', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'desktop-fresh-home-first-update')?.expectedUi ?? '',
    });
    const launched = await launchDesktopUiMatrix({ fresh: true, name: 'desktop-first-update', testInfo });

    try {
      // Windows needs an inactive visible window to keep screenshot compositing alive.
      if (process.platform === 'win32') {
        await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
      }
      await completeOnboardingThroughUi(launched.page);
      await saveAllVisibilityPreferences(launched.page);
      await launched.page.reload({ waitUntil: 'domcontentloaded' });
      await expect(launched.page.getByRole('link', { name: /Create first SKU/ })).toBeVisible();
      await captureUi(launched.page, testInfo, 'home-create-product');

      await launched.page.getByRole('link', { name: /Create first SKU/ }).click();
      await expect(launched.page.getByRole('heading', { name: 'New SKU' })).toBeVisible();
      await navigateHashRoute(launched.page, '/');
      expect(await desktopWorkspaceCounts(launched.page)).toMatchObject({ skuCount: 0, serviceCount: 0, observationCount: 0 });
      await launched.page.getByRole('link', { name: /Create first SKU/ }).click();
      await expect(launched.page.getByRole('heading', { name: 'New SKU' })).toBeVisible();
      const sku = await createSkuThroughUi(launched.page, { name: 'First workspace item' });
      await navigateHashRoute(launched.page, '/');
      await expect(launched.page.getByRole('link', { name: /Capture first update/ })).toHaveAttribute('href', '#/work/capture/stock-count');

      await closeDesktopUiMatrix(launched);
      Object.assign(launched, await launchDesktopUiMatrix({
        dataDirectory: launched.dataDirectory,
        fresh: true,
        name: 'desktop-first-update-resume',
        outputDirectory: launched.outputDirectory,
        testInfo,
      }));
      if (process.platform === 'win32') {
        await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
      }
      await navigateHashRoute(launched.page, '/');
      await captureUi(launched.page, testInfo, 'home-first-update-after-restart');
      await launched.page.getByRole('link', { name: /Capture first update/ }).click();
      await launched.page.getByRole('button', { name: new RegExp(sku.name, 'i') }).first().click();
      const itemDialog = launched.page.getByRole('dialog').first();
      await itemDialog.getByRole('textbox', { name: 'Units in stock' }).fill('7');
      await itemDialog.getByRole('button', { name: 'Done' }).click();
      await launched.page.getByRole('link', { name: 'Home', exact: true }).click();
      await launched.page.getByRole('dialog', { name: 'Leave record update?' }).getByRole('button', { name: 'Save draft', exact: true }).click();
      expect(await desktopWorkspaceCounts(launched.page)).toMatchObject({ observationCount: 0 });
      await launched.page.getByRole('link', { name: /Capture first update/ }).click();
      await launched.page.getByRole('button', { name: new RegExp(sku.name, 'i') }).first().click();
      await expect(itemDialog.getByRole('textbox', { name: 'Units in stock' })).toHaveValue('7');
      await itemDialog.getByRole('button', { name: 'Done' }).click();
      await launched.page.getByRole('button', { name: /^Done$/ }).last().click();
      await launched.page.getByRole('dialog', { name: 'Review update' }).getByRole('button', { name: 'Confirm save' }).click();
      await launched.page.waitForFunction(() => window.kaurKhorDesktop.sena.listObservations().then((observations) => observations.length === 1));
      await navigateHashRoute(launched.page, '/');
      await launched.page.reload({ waitUntil: 'domcontentloaded' });
      await expect(launched.page.getByRole('link', { name: /Start Work/ })).toBeVisible();
      await expect(launched.page.getByRole('link', { name: /Capture first update/ })).toHaveCount(0);
      expect(await desktopWorkspaceCounts(launched.page)).toMatchObject({ skuCount: 1, serviceCount: 0, observationCount: 1 });
      await assertUiStable(launched.page, 'Home after first saved update and reload');
      await captureUi(launched.page, testInfo, 'home-first-update-saved');
      launched.issues.assertNoIssues('Home first-use workflow');
    } finally {
      await closeDesktopUiMatrix(launched);
    }
  });

  test('first-run and empty workspace surfaces stay stable', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'ui-matrix',
      description: UI_MATRIX_CASES.find((entry) => entry.id === 'desktop-fresh-first-run-empty-routes')?.expectedUi ?? '',
    });

    const launched = await launchDesktopUiMatrix({
      fresh: true,
      name: 'desktop-fresh',
      testInfo,
    });

    try {
      await launched.page.waitForLoadState('domcontentloaded');
      await expect(launched.page.getByRole('heading', { name: 'Set up Kaur Khor' })).toBeVisible();
      await assertUiStable(launched.page, 'fresh onboarding');
      await captureUi(launched.page, testInfo, 'fresh-onboarding');

      await completeOnboardingThroughUi(launched.page);
      await saveAllVisibilityPreferences(launched.page);
      await launched.page.reload({ waitUntil: 'domcontentloaded' });
      await assertUiStable(launched.page, 'fresh home after onboarding');
      await captureUi(launched.page, testInfo, 'fresh-home');

      const emptyCounts = await desktopWorkspaceCounts(launched.page);
      expect(emptyCounts).toMatchObject({
        observationCount: 0,
        orderBatchCount: 0,
        serviceCount: 0,
        skuCount: 0,
      });

      await navigateHashRoute(launched.page, '/catalog/skus/new');
      await launched.page.getByRole('button', { name: 'Create entry' }).click();
      await expect(launched.page.getByText('Enter a SKU name before saving.')).toBeVisible();
      await expect(launched.page.getByText('Enter a cost per unit before saving.')).toBeVisible();
      await expect(launched.page.getByText('Enter the expected time of arrival days before saving.')).toBeVisible();
      await expect(launched.page.getByText('Enter ETA variation days and hours or choose an ETA variation before saving.')).toBeVisible();
      await assertUiStable(launched.page, 'fresh new SKU invalid save errors');
      await captureUi(launched.page, testInfo, 'fresh-new-sku-invalid-save');
      const afterInvalidSaveCounts = await desktopWorkspaceCounts(launched.page);
      expect(afterInvalidSaveCounts, 'invalid SKU save should not mutate fresh workspace data').toMatchObject(emptyCounts);

      for (const routeCase of freshEmptyRoutes) {
        await navigateHashRoute(launched.page, routeCase.route);
        await routeCase.assertion(launched.page);
        await scrollMainSurface(launched.page);
        await assertUiStable(launched.page, `fresh route ${routeCase.route}`);
        await captureUi(launched.page, testInfo, routeCase.capture);
      }

      await verifyBackForward(launched.page, '/settings/interface', '/catalog/skus/new');
      await assertUiStable(launched.page, 'fresh back-forward navigation');

      const afterRouteCounts = await desktopWorkspaceCounts(launched.page);
      expect(afterRouteCounts).toMatchObject(emptyCounts);
      launched.issues.assertNoIssues('fresh desktop matrix');
    } finally {
      await closeDesktopUiMatrix(launched);
    }
  });
});
