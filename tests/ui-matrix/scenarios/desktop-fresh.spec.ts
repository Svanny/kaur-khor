import { expect, test, type Page } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import { createSkuThroughUi } from '../helpers/forms';
import {
  closeDesktopUiMatrix,
  completeOnboardingThroughUi,
  desktopWorkspaceCounts,
  launchDesktopUiMatrix,
  saveAllVisibilityPreferences,
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
