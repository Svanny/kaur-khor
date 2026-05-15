import { expect, type Download, type Page } from '@playwright/test';
import {
  assertNoBrokenNumericText,
  assertNoDocumentOverflow,
  assertInteractiveControlsStable,
  assertRenderedContent,
  assertViewportSizeStable,
  attachPageIssueCollector,
  type PageIssueCollector,
} from './runtime-guards';

export interface PreparedWebPage {
  issues: PageIssueCollector;
  page: Page;
}

export async function openEmbeddedRoute(page: Page, mode: 'app' | 'demo', route: `/${string}` = '/') {
  await page.goto(`/kaur-khor/${mode}#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(750);
}

export async function prepareWebPage(page: Page): Promise<PreparedWebPage> {
  const issues = attachPageIssueCollector(page);
  return { issues, page };
}

export async function assertEmbeddedUiStable(page: Page, context: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(250);
  await assertRenderedContent(page, context);
  await assertNoDocumentOverflow(page, context);
  await assertNoBrokenNumericText(page, context);
  await assertInteractiveControlsStable(page, context);
  await assertViewportSizeStable(page, context);
}

export async function browserWorkspaceCounts(page: Page) {
  return page.evaluate(async () => {
    const [catalog, observations] = await Promise.all([
      window.kaurKhorDesktop.sena.getCatalog(),
      window.kaurKhorDesktop.sena.listObservations(),
    ]);
    return {
      observationCount: observations.length,
      serviceCount: catalog?.services.length ?? 0,
      skuCount: catalog?.skus.length ?? 0,
    };
  });
}

export async function expectEmbeddedBannerControls(page: Page, mode: 'app' | 'demo') {
  const exportButton = page.getByRole('button', { name: 'Export backup' }).first();
  const importButton = page.getByRole('button', { name: 'Import backup' }).first();
  const resetButton = page.getByRole('button', { name: mode === 'demo' ? 'Reset demo' : 'Reset workspace' }).first();
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await expect(importButton).toBeVisible();
  await expect(importButton).toBeEnabled();
  await expect(resetButton).toBeVisible();
  await expect(resetButton).toBeEnabled();
}

export async function exportEmbeddedBackup(page: Page): Promise<Download> {
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Export backup' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename(), 'browser backup export should use the Kaur Khor backup filename').toMatch(/kaur-khor-.*backup.*\.json$/);
  return download;
}

export async function importEmbeddedBackup(page: Page, path: string) {
  const reloadPromise = page.waitForEvent('domcontentloaded', { timeout: 15_000 });
  await page.locator('input[type="file"][accept*="json"]').first().setInputFiles(path);
  await reloadPromise;
  await page.waitForTimeout(750);
}

export async function resetEmbeddedWorkspaceThroughUi(page: Page, mode: 'app' | 'demo') {
  const reloadPromise = page.waitForEvent('domcontentloaded', { timeout: 5_000 }).catch(() => null);
  if (mode === 'app') {
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Reset this browser workspace?');
      await dialog.accept();
    });
  }
  await page.getByRole('button', { name: mode === 'demo' ? 'Reset demo' : 'Reset workspace' }).first().click();
  const phoneResetConfirmation = page.locator('[data-slot="phone-reset-confirmation"]');
  if (await phoneResetConfirmation.isVisible().catch(() => false)) {
    await phoneResetConfirmation.getByRole('button', { name: mode === 'demo' ? 'Reset demo' : 'Reset workspace' }).click();
  }
  await reloadPromise;
  await page.waitForTimeout(750);
}

export async function completeEmbeddedOnboardingIfPresent(page: Page) {
  const setupHeading = page.getByRole('heading', { name: 'Set up Kaur Khor' });
  if (!(await setupHeading.isVisible().catch(() => false))) {
    return;
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '', undefined, { timeout: 10_000 });
  await page.waitForTimeout(500);
}

export async function resetEmbeddedWorkspace(page: Page) {
  await page.evaluate(async () => {
    await window.kaurKhorDesktop.system.clearCurrentData();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(750);
}
