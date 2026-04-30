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

    expect(handlerSource).toContain('await managedCore.stop();');
    expect(handlerSource).toContain('restoreDesktopBackupSnapshot({');
    expect(handlerSource.indexOf('await managedCore.stop();')).toBeLessThan(
      handlerSource.indexOf('restoreDesktopBackupSnapshot({'),
    );
  });
});
