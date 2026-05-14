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

    expect(shellScriptSource).toContain('sourceArchiveName');
    expect(shellScriptSource).toContain('sha256sum -c ${shellQuote(`${sourceArchiveName}.sha256`)}');
    expect(shellScriptSource).toContain('shasum -a 256 -c ${shellQuote(`${sourceArchiveName}.sha256`)}');
    expect(shellScriptSource.indexOf('sha256sum -c ${shellQuote(`${sourceArchiveName}.sha256`)}')).toBeLessThan(
      shellScriptSource.indexOf('tar -xzf ${shellQuote(sourceArchiveName)}'),
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
      windowsScriptSource.indexOf('tar -xzf "${sourceArchiveName}"'),
    );
  });

  it('builds latest and versioned source-build archive URLs', async () => {
    const { sourceArchiveUrlForVersion } = await import('./desktop-update');

    expect(sourceArchiveUrlForVersion('latest')).toBe(
      'https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz',
    );
    expect(sourceArchiveUrlForVersion('v0.5.2')).toBe(
      'https://github.com/Svanny/kaur-khor/releases/download/v0.5.2/kaur-khor-v0.5.2-source-build.tar.gz',
    );
  });

  it('rejects source-build versions that cannot be safely embedded in updater scripts', async () => {
    const { sourceArchiveUrlForVersion } = await import('./desktop-update');

    expect(() => sourceArchiveUrlForVersion('v0.5.2$(touch /tmp/kaur-khor-owned)')).toThrow(
      'Choose a valid Kaur Khor release version before starting the updater.',
    );
    expect(() => sourceArchiveUrlForVersion('v0.5.2"; Start-Process calc; "')).toThrow(
      'Choose a valid Kaur Khor release version before starting the updater.',
    );
  });

  it('passes selected source-build version and pruning flags to update scripts', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/desktop-update.ts'), 'utf8');

    expect(source).toContain('sourceVersion: normalizeSourceVersion(payload.sourceVersion)');
    expect(source).toContain("oldSourceBuilds: payload.oldSourceBuilds ?? 'ask'");
    expect(source).toContain("--delete-old-source-builds");
    expect(source).toContain("--keep-old-source-builds");
    expect(source).toContain('sourceArchiveUrlForVersion(sourceVersion)');
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
