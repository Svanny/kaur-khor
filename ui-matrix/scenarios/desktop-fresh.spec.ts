import { expect, test, type Page } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
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
