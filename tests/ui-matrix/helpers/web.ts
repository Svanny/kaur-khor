import { expect, type Download, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
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
  await page.locator('[data-slot="embedded-phone-shell"], [data-slot="embedded-auto-zoom-viewport"]').first()
    .waitFor({ state: 'visible' });
  await page.waitForFunction(() => (document.body?.innerText.trim().length ?? 0) > 0);
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

export async function importSeededDemoWorkspace(page: Page, testInfo: TestInfo) {
  // Populated scenarios must explicitly import a fixture; normal demo startup/reset stays blank.
  const backup = await page.evaluate(async () => {
    const fixtureModule = '/kaur-khor/src/renderer/src/dev/browser-desktop-bridge.ts';
    const backupModule = '/kaur-khor/src/renderer/src/runtime/web/backup.ts';
    const constantsModule = '/kaur-khor/src/renderer/src/runtime/web/constants.ts';
    const { createMockState } = await import(fixtureModule);
    const { createBrowserStorageBackup } = await import(backupModule);
    const { KAUR_KHOR_BROWSER_DEMO_DATABASE: databaseName } = await import(constantsModule);
    const state = createMockState();
    const updatedAt = new Date().toISOString();
    state.preferences.onboardingCompletedAt = updatedAt;
    return createBrowserStorageBackup(databaseName, [{
      collection: 'browser_state', id: databaseName, json: state, updatedAt,
    }], updatedAt);
  });
  const path = testInfo.outputPath('seeded-demo-backup.json');
  await writeFile(path, JSON.stringify(backup), 'utf8');
  await importEmbeddedBackup(page, path);
  await expect.poll(async () => {
    const counts = await browserWorkspaceCounts(page);
    return counts.skuCount > 0 && counts.serviceCount > 0 && counts.observationCount > 0;
  }, { message: 'explicit demo fixture should populate catalog and observations' }).toBe(true);
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

export async function exportEmbeddedBackupPath(page: Page, testInfo: TestInfo, name: string) {
  const download = await exportEmbeddedBackup(page);
  const path = testInfo.outputPath(`${name}.json`);
  await download.saveAs(path);
  return path;
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
  await page.waitForFunction(() => (
    !document.body.innerText.includes('Set up Kaur Khor')
    || document.body.innerText.includes('Choose interface view')
  ), undefined, { timeout: 10_000 });
  const interfaceHeading = page.getByRole('heading', { name: 'Choose interface view' });
  if (await interfaceHeading.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(setupHeading).toHaveCount(0, { timeout: 10_000 });
  await expect(interfaceHeading).toHaveCount(0, { timeout: 10_000 });
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
