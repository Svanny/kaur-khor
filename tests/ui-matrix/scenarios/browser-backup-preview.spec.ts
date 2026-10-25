import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createSkuThroughUi } from '../helpers/forms';
import { captureUi } from '../helpers/runtime-guards';
import {
  browserWorkspaceCounts,
  completeEmbeddedOnboardingIfPresent,
  exportEmbeddedBackupPath,
  importEmbeddedBackup,
  openEmbeddedRoute,
  prepareWebPage,
} from '../helpers/web';

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

    await importEmbeddedBackup(page, emptyBackup);
    await expect(page.getByRole('button', { name: 'Export backup', exact: true }).first()).toBeEnabled();
    expect(await browserWorkspaceCounts(page)).toEqual({ skuCount: 0, serviceCount: 0, observationCount: 0 });
    prepared.issues.assertNoIssues(`backup preview ${surface} cancellation and explicit import`);
  });
}
