import { test } from '@playwright/test';
import {
  clickSidebarNavigation,
  closeKaurKhorBenchmarkApp,
  currentBenchmarkRoute,
  launchKaurKhorForBenchmark,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

test('back button skips intra-page state changes and returns to previous page', async ({}, testInfo) => {
  const launched = await launchKaurKhorForBenchmark('back-button', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');

    // Navigate to Products via sidebar
    await clickSidebarNavigation(launched.page, 'Products');
    await waitForPersistedBenchmarkEventCount(launched, 'route.catalog.ready');
    const catalogRoute = await currentBenchmarkRoute(launched.page);

    // Navigate to Archive via the Archive link in Products
    const archiveLink = launched.page.getByRole('link', { name: 'Archive' });
    await archiveLink.waitFor({ state: 'visible', timeout: 30_000 });
    await archiveLink.click();
    await launched.page.waitForFunction(
      () => {
        const route = window.location.hash.startsWith('#/')
          ? window.location.hash.slice(1)
          : `${window.location.pathname}${window.location.search}` || '/';
        return route.startsWith('/catalog?status=archived') || route.startsWith('/operations/archive');
      },
      { timeout: 30_000 },
    );

    // Toggle a filter on the Archive page (click the "SKUs" radio button)
    const skusRadio = launched.page.getByRole('radio', { name: 'SKUs' });
    await skusRadio.waitFor({ state: 'visible', timeout: 30_000 });
    await skusRadio.click();

    // Wait a tick for the intra-page state change to settle
    await launched.page.waitForTimeout(300);

    // Click the back button
    const backButton = launched.page.getByRole('button', { name: 'Back' });
    await backButton.waitFor({ state: 'visible', timeout: 30_000 });
    await backButton.click();

    // Wait for navigation to settle
    await launched.page.waitForFunction(
      () => {
        const route = window.location.hash.startsWith('#/')
          ? window.location.hash.slice(1)
          : `${window.location.pathname}${window.location.search}` || '/';
        return !route.startsWith('/operations/archive') && !route.startsWith('/catalog?status=archived');
      },
      { timeout: 30_000 },
    );

    const finalRoute = await currentBenchmarkRoute(launched.page);

    // Assert that the current route is the previous page (Catalog), NOT Archive with a different query param
    if (!finalRoute.startsWith('/catalog') || finalRoute.startsWith('/catalog?status=archived')) {
      throw new Error(
        `Expected back button to return to the previous page (e.g. /catalog), but got "${finalRoute}". ` +
          `Started from "${catalogRoute}".`,
      );
    }
  } finally {
    await closeKaurKhorBenchmarkApp(launched, 'back-button');
  }
});
