// @vitest-environment node

import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('node:child_process');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('desktop source-build updater', () => {
  it('verifies the downloaded source-build checksum before extracting on shell platforms', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/desktop-update.ts'), 'utf8');
    const shellScriptStart = source.indexOf('function shellUpdateScript');
    const shellScriptEnd = source.indexOf('function windowsUpdateScript', shellScriptStart);
    const shellScriptSource = source.slice(shellScriptStart, shellScriptEnd);

    expect(shellScriptSource).toContain('kaur-khor-latest-source-build.tar.gz.sha256');
    expect(shellScriptSource).toContain('sha256sum -c kaur-khor-latest-source-build.tar.gz.sha256');
    expect(shellScriptSource).toContain('shasum -a 256 -c kaur-khor-latest-source-build.tar.gz.sha256');
    expect(shellScriptSource.indexOf('sha256sum -c kaur-khor-latest-source-build.tar.gz.sha256')).toBeLessThan(
      shellScriptSource.indexOf('tar -xzf kaur-khor-latest-source-build.tar.gz'),
    );
  });

  it('verifies the downloaded source-build checksum before extracting on Windows', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/desktop-update.ts'), 'utf8');
    const windowsScriptStart = source.indexOf('function windowsUpdateScript');
    const windowsScriptEnd = source.indexOf('function launchScriptInTerminal', windowsScriptStart);
    const windowsScriptSource = source.slice(windowsScriptStart, windowsScriptEnd);

    expect(windowsScriptSource).toContain('Get-FileHash -Algorithm SHA256');
    expect(windowsScriptSource).toContain('SHA-256 mismatch for Kaur Khor source-build archive');
    expect(windowsScriptSource.indexOf('Get-FileHash -Algorithm SHA256')).toBeLessThan(
      windowsScriptSource.indexOf('tar -xzf "kaur-khor-latest-source-build.tar.gz"'),
    );
  });

  it('does not quit or report started when terminal handoff fails', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    const spawn = vi.fn(() => {
      process.nextTick(() => {
        child.emit('error', Object.assign(new Error('spawn x-terminal-emulator ENOENT'), { code: 'ENOENT' }));
      });
      return child;
    });
    vi.doMock('node:child_process', () => ({ spawn }));
    const { launchKaurKhorSourceUpdate } = await import('./desktop-update');
    const app = { quit: vi.fn() };
    const result = launchKaurKhorSourceUpdate({
      app: app as never,
      appVersion: '0.4.1',
      dataDirectoryPath: '/tmp/kaur-khor-data',
      payload: { skipBackup: true },
    });

    await expect(result).rejects.toThrow('spawn x-terminal-emulator ENOENT');
    expect(app.quit).not.toHaveBeenCalled();
    expect(child.unref).not.toHaveBeenCalled();
  });
});
