// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backup IPC handlers', () => {
  it('stops the managed core before starting snapshot restore work', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const handlerStart = source.indexOf('IPC_CHANNELS.systemRestoreBackupSnapshot');
    const handlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemClearCurrentData', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('await suspendDesktopRuntimeForDataReplacement();');
    expect(handlerSource).toContain('restoreDesktopBackupSnapshot({');
    expect(handlerSource.indexOf('await suspendDesktopRuntimeForDataReplacement();')).toBeLessThan(
      handlerSource.indexOf('restoreDesktopBackupSnapshot({'),
    );
  });

  it('suspends Telegram automation and core maintenance before restore and clear data replacement', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const suspensionStart = source.indexOf('async function suspendDesktopRuntimeForDataReplacement');
    const suspensionEnd = source.indexOf('function requestDesktopQuit', suspensionStart);
    const suspensionSource = source.slice(suspensionStart, suspensionEnd);
    const restoreHandlerStart = source.indexOf('IPC_CHANNELS.systemRestoreBackupSnapshot');
    const restoreHandlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemClearCurrentData', restoreHandlerStart);
    const restoreHandlerSource = source.slice(restoreHandlerStart, restoreHandlerEnd);
    const clearHandlerStart = source.indexOf('IPC_CHANNELS.systemClearCurrentData');
    const clearHandlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemCheckForUpdate', clearHandlerStart);
    const clearHandlerSource = source.slice(clearHandlerStart, clearHandlerEnd);

    expect(suspensionSource).toContain('telegramAutomationLoop?.stop();');
    expect(suspensionSource).toContain('clearTimeout(senaReadCachePersistTimer);');
    expect(suspensionSource).toContain('senaInflightReads.clear();');
    expect(suspensionSource).toContain('await managedCore.stop();');
    expect(restoreHandlerSource).toContain('await suspendDesktopRuntimeForDataReplacement();');
    expect(clearHandlerSource).toContain('await suspendDesktopRuntimeForDataReplacement();');
    expect(restoreHandlerSource).toContain('startDesktopTelegramAutomationLoop();');
    expect(clearHandlerSource).toContain('startDesktopTelegramAutomationLoop();');
    expect(restoreHandlerSource.indexOf('await suspendDesktopRuntimeForDataReplacement();')).toBeLessThan(
      restoreHandlerSource.indexOf('restoreDesktopBackupSnapshot({'),
    );
    expect(clearHandlerSource.indexOf('await suspendDesktopRuntimeForDataReplacement();')).toBeLessThan(
      clearHandlerSource.indexOf('clearCurrentDesktopData(desktopDataPath)'),
    );
  });

  it('launches source-build updates only after quit confirmation and main-selected data-dir validation', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    const runHandlerStart = source.indexOf('IPC_CHANNELS.systemRunSourceBuildUpdate');
    const runHandlerEnd = source.indexOf('ipcMain.handle(IPC_CHANNELS.systemRevealPath', runHandlerStart);
    const runHandlerSource = source.slice(runHandlerStart, runHandlerEnd);
    const resolverStart = source.indexOf('function resolveUpdateDataDirectoryPath');
    const resolverEnd = source.indexOf('async function seedAutomationBenchmarkWorkspace', resolverStart);
    const resolverSource = source.slice(resolverStart, resolverEnd);

    expect(resolverSource).toContain('selectedUpdateDataDirectoryPath');
    expect(resolverSource).toContain('throw new Error(\'Choose the update data folder from Kaur Khor before starting the updater.\');');
    expect(runHandlerSource).toContain('const dataDirectoryPath = resolveUpdateDataDirectoryPath(payload.dataDirectoryPath);');
    expect(runHandlerSource).toContain('const shouldQuit = await confirmDesktopQuitForLiveAutomation();');
    expect(runHandlerSource).toContain('started: false');
    expect(runHandlerSource).toContain('desktopQuitConfirmed = true;');
    expect(runHandlerSource.indexOf('const shouldQuit = await confirmDesktopQuitForLiveAutomation();')).toBeLessThan(
      runHandlerSource.indexOf('launchKaurKhorSourceUpdate({'),
    );
  });
});
