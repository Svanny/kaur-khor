// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backup IPC handlers', () => {
  it('queues restore inside the desktop data replacement gate', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const handlerStart = source.indexOf('IPC_CHANNELS.systemRestoreBackupSnapshot');
    const handlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemClearCurrentData', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('return runDesktopDataReplacement(async () => {');
    expect(handlerSource).toContain('restoreDesktopBackupSnapshot({');
    expect(handlerSource.indexOf('return runDesktopDataReplacement(async () => {')).toBeLessThan(
      handlerSource.indexOf('restoreDesktopBackupSnapshot({'),
    );
  });

  it('suspends Telegram automation and core maintenance through the shared replacement queue', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const automationSource = await readFile(join(process.cwd(), 'src/main/automation-telegram.ts'), 'utf8');
    const suspensionStart = source.indexOf('function stopDesktopRuntimeForShutdown');
    const suspensionEnd = source.indexOf('function requestDesktopQuit', suspensionStart);
    const suspensionSource = source.slice(suspensionStart, suspensionEnd);
    const restoreHandlerStart = source.indexOf('IPC_CHANNELS.systemRestoreBackupSnapshot');
    const restoreHandlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemClearCurrentData', restoreHandlerStart);
    const restoreHandlerSource = source.slice(restoreHandlerStart, restoreHandlerEnd);
    const clearHandlerStart = source.indexOf('IPC_CHANNELS.systemClearCurrentData');
    const clearHandlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemCheckForUpdate', clearHandlerStart);
    const clearHandlerSource = source.slice(clearHandlerStart, clearHandlerEnd);

    expect(suspensionSource).toContain('await telegramAutomationLoop?.stopAndDrain();');
    expect(automationSource).toContain('let runningTick: Promise<void> | null = null;');
    expect(automationSource).toContain('async stopAndDrain()');
    expect(automationSource).toContain('await runningTick;');
    expect(suspensionSource).toContain('clearTimeout(senaReadCachePersistTimer);');
    expect(suspensionSource).toContain('senaInflightReads.clear();');
    expect(suspensionSource).toContain('await managedCore.stop();');
    expect(suspensionSource).toContain('desktopShutdownStarted = true;');
    expect(suspensionSource).toContain('await desktopDataReplacementQueue.catch(() => undefined);');
    expect(suspensionSource).toContain('desktopShutdownCompleted = true;');
    expect(suspensionSource).toContain('pendingDesktopDataReplacements += 1;');
    expect(suspensionSource).toContain('desktopDataReplacementSuspension = suspendDesktopRuntimeForDataReplacement();');
    expect(suspensionSource).toContain('await desktopDataReplacementSuspension;');
    expect(suspensionSource).toContain('pendingDesktopDataReplacements = Math.max(0, pendingDesktopDataReplacements - 1);');
    expect(suspensionSource).toContain('if (pendingDesktopDataReplacements === 0) {');
    expect(suspensionSource).toContain('if (!desktopShutdownStarted) {');
    expect(suspensionSource).toContain('startDesktopTelegramAutomationLoop();');
    expect(suspensionSource.indexOf('await desktopDataReplacementQueue.catch(() => undefined);')).toBeLessThan(
      suspensionSource.indexOf('await managedCore.stop();'),
    );
    expect(suspensionSource.indexOf('if (!desktopShutdownStarted) {')).toBeLessThan(
      suspensionSource.indexOf('startDesktopTelegramAutomationLoop();'),
    );
    expect(restoreHandlerSource).toContain('return runDesktopDataReplacement(async () => {');
    expect(clearHandlerSource).toContain('return runDesktopDataReplacement(async () => {');
    expect(restoreHandlerSource.indexOf('return runDesktopDataReplacement(async () => {')).toBeLessThan(
      restoreHandlerSource.indexOf('restoreDesktopBackupSnapshot({'),
    );
    expect(clearHandlerSource.indexOf('return runDesktopDataReplacement(async () => {')).toBeLessThan(
      clearHandlerSource.indexOf('clearCurrentDesktopData(desktopDataPath)'),
    );
    expect(clearHandlerSource).toContain('markDevWorkspaceBlank(desktopDataPath)');
    expect(clearHandlerSource.indexOf('clearCurrentDesktopData(desktopDataPath)')).toBeLessThan(
      clearHandlerSource.indexOf('markDevWorkspaceBlank(desktopDataPath)'),
    );
  });

  it('launches source-build updates only after quit confirmation and main-selected update path validation', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const runHandlerStart = source.indexOf('IPC_CHANNELS.systemRunSourceBuildUpdate');
    const runHandlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemRevealPath', runHandlerStart);
    const runHandlerSource = source.slice(runHandlerStart, runHandlerEnd);
    const resolverStart = source.indexOf('function resolveUpdateDataDirectoryPath');
    const resolverEnd = source.indexOf('async function seedAutomationBenchmarkWorkspace', resolverStart);
    const resolverSource = source.slice(resolverStart, resolverEnd);

    expect(resolverSource).toContain('selectedUpdateDataDirectoryPath');
    expect(resolverSource).toContain('throw new Error(\'Choose the update data folder from Kaur Khor before starting the updater.\');');
    expect(resolverSource).toContain('function resolveUpdateBackupDirectoryPath');
    expect(resolverSource).toContain('selectedUpdateBackupDirectoryPath');
    expect(resolverSource).toContain('throw new Error(\'Choose the update snapshot export folder from Kaur Khor before starting the updater.\');');
    expect(source).toContain('selectedUpdateBackupDirectoryPath = selection.canceled ? null : selection.filePaths[0] ?? null;');
    expect(runHandlerSource).toContain('async (_event, payload?: DesktopUpdateRunPayload)');
    expect(runHandlerSource).toContain('const dataDirectoryPath = resolveUpdateDataDirectoryPath(payload?.dataDirectoryPath);');
    expect(runHandlerSource).toContain('const backupDirectoryPath = resolveUpdateBackupDirectoryPath(payload?.backupDirectoryPath, payload?.skipBackup === true);');
    expect(runHandlerSource).toContain('const shouldQuit = await confirmDesktopQuitForLiveAutomation();');
    expect(runHandlerSource).toContain('started: false');
    expect(runHandlerSource).toContain('desktopQuitConfirmed = true;');
    expect(runHandlerSource).toContain('await stopDesktopRuntimeForShutdown();');
    expect(runHandlerSource).toContain('backupDirectoryPath,');
    expect(runHandlerSource.indexOf('const shouldQuit = await confirmDesktopQuitForLiveAutomation();')).toBeLessThan(
      runHandlerSource.indexOf('await stopDesktopRuntimeForShutdown();'),
    );
    expect(runHandlerSource.indexOf('await stopDesktopRuntimeForShutdown();')).toBeLessThan(
      runHandlerSource.indexOf('launchKaurKhorSourceUpdate({'),
    );
  });

  it('keeps quit blocked until shutdown has drained queued replacements', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const beforeQuitStart = source.indexOf('app.on(\'before-quit\'');
    const beforeQuitSource = source.slice(beforeQuitStart);
    const requestQuitStart = source.indexOf('function requestDesktopQuit');
    const requestQuitEnd = source.indexOf('function isSameResolvedPath', requestQuitStart);
    const requestQuitSource = source.slice(requestQuitStart, requestQuitEnd);
    const windowAllClosedStart = source.indexOf('app.on(\'window-all-closed\'');
    const windowAllClosedEnd = source.indexOf('app.on(\'before-quit\'', windowAllClosedStart);
    const windowAllClosedSource = source.slice(windowAllClosedStart, windowAllClosedEnd);

    expect(beforeQuitSource).toContain('if (desktopShutdownCompleted) {');
    expect(beforeQuitSource).toContain('event.preventDefault();');
    expect(beforeQuitSource).toContain('void stopDesktopRuntimeForShutdown().finally(() => {');
    expect(beforeQuitSource).toContain('app.quit();');
    expect(beforeQuitSource.indexOf('if (desktopShutdownCompleted) {')).toBeLessThan(
      beforeQuitSource.indexOf('event.preventDefault();'),
    );
    expect(beforeQuitSource.indexOf('event.preventDefault();')).toBeLessThan(
      beforeQuitSource.indexOf('void stopDesktopRuntimeForShutdown().finally(() => {'),
    );
    expect(requestQuitSource).toContain('desktopQuitConfirmed = true;');
    expect(requestQuitSource).toContain('void stopDesktopRuntimeForShutdown().finally(() => {');
    expect(requestQuitSource.indexOf('desktopQuitConfirmed = true;')).toBeLessThan(
      requestQuitSource.indexOf('void stopDesktopRuntimeForShutdown().finally(() => {'),
    );
    expect(windowAllClosedSource).toContain('await stopDesktopRuntimeForShutdown();');
    expect(windowAllClosedSource).toContain('desktopQuitConfirmed = true;');
    expect(windowAllClosedSource.indexOf('await stopDesktopRuntimeForShutdown();')).toBeLessThan(
      windowAllClosedSource.indexOf('desktopQuitConfirmed = true;'),
    );
    expect(windowAllClosedSource.indexOf('desktopQuitConfirmed = true;')).toBeLessThan(
      windowAllClosedSource.indexOf('app.quit();'),
    );
  });

  it('validates picked image bytes before native image decoding', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const handlerStart = source.indexOf('IPC_CHANNELS.systemPickAndStoreImage');
    const handlerEnd = source.indexOf('IPC_CHANNELS.systemStoreDroppedImage', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(source).toContain("import { assertDesktopImageFileIsSafeForImport } from './desktop-image-import';");
    expect(handlerSource).toContain('await assertDesktopImageFileIsSafeForImport(sourcePath);');
    expect(handlerSource.indexOf('await assertDesktopImageFileIsSafeForImport(sourcePath);')).toBeLessThan(
      handlerSource.indexOf('normalizedImage = await normalizeDesktopImage(sourcePath);'),
    );
    expect(handlerSource).toContain('endNormalize({');
    expect(handlerSource).toContain('ok: false,');
    expect(handlerSource).toContain('throw error;');
  });
});
