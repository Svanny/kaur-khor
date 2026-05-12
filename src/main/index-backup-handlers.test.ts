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
    const suspensionStart = source.indexOf('async function suspendDesktopRuntimeForDataReplacement');
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
    expect(suspensionSource).toContain('pendingDesktopDataReplacements += 1;');
    expect(suspensionSource).toContain('desktopDataReplacementSuspension = suspendDesktopRuntimeForDataReplacement();');
    expect(suspensionSource).toContain('await desktopDataReplacementSuspension;');
    expect(suspensionSource).toContain('pendingDesktopDataReplacements = Math.max(0, pendingDesktopDataReplacements - 1);');
    expect(suspensionSource).toContain('if (pendingDesktopDataReplacements === 0) {');
    expect(suspensionSource).toContain('startDesktopTelegramAutomationLoop();');
    expect(restoreHandlerSource).toContain('return runDesktopDataReplacement(async () => {');
    expect(clearHandlerSource).toContain('return runDesktopDataReplacement(async () => {');
    expect(restoreHandlerSource.indexOf('return runDesktopDataReplacement(async () => {')).toBeLessThan(
      restoreHandlerSource.indexOf('restoreDesktopBackupSnapshot({'),
    );
    expect(clearHandlerSource.indexOf('return runDesktopDataReplacement(async () => {')).toBeLessThan(
      clearHandlerSource.indexOf('clearCurrentDesktopData(desktopDataPath)'),
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
    expect(runHandlerSource).toContain('const dataDirectoryPath = resolveUpdateDataDirectoryPath(payload.dataDirectoryPath);');
    expect(runHandlerSource).toContain('const backupDirectoryPath = resolveUpdateBackupDirectoryPath(payload.backupDirectoryPath, payload.skipBackup === true);');
    expect(runHandlerSource).toContain('const shouldQuit = await confirmDesktopQuitForLiveAutomation();');
    expect(runHandlerSource).toContain('started: false');
    expect(runHandlerSource).toContain('desktopQuitConfirmed = true;');
    expect(runHandlerSource).toContain('backupDirectoryPath,');
    expect(runHandlerSource.indexOf('const shouldQuit = await confirmDesktopQuitForLiveAutomation();')).toBeLessThan(
      runHandlerSource.indexOf('launchKaurKhorSourceUpdate({'),
    );
  });
});
