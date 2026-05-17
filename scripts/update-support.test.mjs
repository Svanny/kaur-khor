import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPreUpdateBackup,
  defaultDataDirectoryForPlatform,
  parseBackupDirectoryPromptAnswer,
  preUpdateBackupName,
  prepareSourceBuildUpdate,
  sourceBuildArchiveNames,
} from './update-support.mjs';

describe('source-build update support', () => {
  const tempRoots = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(tempRoots.map((path) => rm(path, { force: true, recursive: true })));
    tempRoots.length = 0;
  });

  async function tempRoot(prefix) {
    const root = await mkdtemp(join(tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  it('generates versioned, latest, and legacy source-build archive names', () => {
    expect(sourceBuildArchiveNames('0.3.5')).toEqual({
      tag: 'v0.3.5',
      versionedBaseName: 'kaur-khor-v0.3.5-source-build',
      versionedArchiveName: 'kaur-khor-v0.3.5-source-build.tar.gz',
      latestBaseName: 'kaur-khor-latest-source-build',
      latestArchiveName: 'kaur-khor-latest-source-build.tar.gz',
      legacyBaseName: 'kaur-khor-source-build',
      legacyArchiveName: 'kaur-khor-source-build.tar.gz',
    });
  });

  it('uses a stable pre-update backup name', () => {
    expect(preUpdateBackupName({
      currentVersion: '0.3.4',
      nextVersion: '0.3.5',
      now: new Date('2026-05-09T09:00:00.000Z'),
    })).toBe('kaur-khor-pre-update-v0.3.4-to-v0.3.5-2026-05-09T09-00-00-000Z');
  });

  it('backs up a user-selected data directory without temp files', async () => {
    const dataDir = await tempRoot('kaur-khor-data-');
    const backupDir = await tempRoot('kaur-khor-backups-');
    writeFileSync(join(dataDir, 'desktop-sena-store.sqlite3'), 'sqlite');
    writeFileSync(join(dataDir, 'desktop-preferences.json'), '{}');
    writeFileSync(join(dataDir, 'skip.tmp'), 'tmp');
    mkdirSync(join(dataDir, 'sena-checkpoints'));
    writeFileSync(join(dataDir, 'sena-checkpoints', 'checkpoint.json'), 'checkpoint');

    const backupPath = createPreUpdateBackup({
      backupDir,
      currentVersion: '0.3.4',
      dataDir,
      nextVersion: '0.3.5',
      now: new Date('2026-05-09T09:00:00.000Z'),
    });

    expect(readFileSync(join(backupPath, 'desktop-sena-store.sqlite3'), 'utf8')).toBe('sqlite');
    expect(readFileSync(join(backupPath, 'desktop-preferences.json'), 'utf8')).toBe('{}');
    expect(readFileSync(join(backupPath, 'sena-checkpoints', 'checkpoint.json'), 'utf8')).toBe('checkpoint');
    expect(() => readFileSync(join(backupPath, 'skip.tmp'), 'utf8')).toThrow();
  });

  it('skips symlinks in pre-update backup exports', async () => {
    const dataDir = await tempRoot('kaur-khor-data-');
    const backupDir = await tempRoot('kaur-khor-backups-');
    const outsideRoot = await tempRoot('kaur-khor-outside-');
    writeFileSync(join(dataDir, 'desktop-sena-store.sqlite3'), 'sqlite');
    mkdirSync(join(dataDir, 'sena-checkpoints'));
    writeFileSync(join(dataDir, 'sena-checkpoints', 'checkpoint.json'), 'checkpoint');
    writeFileSync(join(outsideRoot, 'outside.txt'), 'outside');
    symlinkSync(join(outsideRoot, 'outside.txt'), join(dataDir, 'linked-outside.txt'));
    symlinkSync(join(outsideRoot, 'outside.txt'), join(dataDir, 'sena-checkpoints', 'linked-nested.txt'));

    const backupPath = createPreUpdateBackup({
      backupDir,
      currentVersion: '0.3.4',
      dataDir,
      nextVersion: '0.3.5',
      now: new Date('2026-05-09T09:00:00.000Z'),
    });

    expect(readFileSync(join(backupPath, 'desktop-sena-store.sqlite3'), 'utf8')).toBe('sqlite');
    expect(readFileSync(join(backupPath, 'sena-checkpoints', 'checkpoint.json'), 'utf8')).toBe('checkpoint');
    expect(() => lstatSync(join(backupPath, 'linked-outside.txt'))).toThrow();
    expect(() => lstatSync(join(backupPath, 'sena-checkpoints', 'linked-nested.txt'))).toThrow();
  });

  it('treats interactive SKIP as an explicit backup skip', async () => {
    const dataDir = await tempRoot('kaur-khor-data-');
    writeFileSync(join(dataDir, 'desktop-sena-store.sqlite3'), 'sqlite');

    const result = await prepareSourceBuildUpdate({
      dataDir,
      nextVersion: '0.3.5',
      promptForBackupDirectory: async () => parseBackupDirectoryPromptAnswer('SKIP'),
      target: { os: 'linux' },
    });

    expect(result.backupPath).toBe(null);
    expect(result.dataDir).toBe(dataDir);
  });

  it('skips backup automatically when no existing app data is present', async () => {
    const root = await tempRoot('kaur-khor-update-empty-');
    vi.stubEnv('XDG_CONFIG_HOME', root);
    const promptForBackupDirectory = vi.fn();

    const result = await prepareSourceBuildUpdate({
      nextVersion: '0.5.2',
      promptForBackupDirectory,
      target: { os: 'linux' },
    });

    expect(result.backupPath).toBe(null);
    expect(result.dataDir).toBe(resolve(root, 'KAUR KHOR'));
    expect(promptForBackupDirectory).not.toHaveBeenCalled();
  });

  it('fails when an explicit update data directory is missing', async () => {
    const root = await tempRoot('kaur-khor-update-default-');
    const defaultDataDir = join(root, 'KAUR KHOR');
    const missingDataDir = join(root, 'missing-custom-data');
    mkdirSync(defaultDataDir);
    expect(existsSync(missingDataDir)).toBe(false);
    vi.stubEnv('XDG_CONFIG_HOME', root);

    await expect(prepareSourceBuildUpdate({
      backupDir: await tempRoot('kaur-khor-backups-'),
      dataDir: missingDataDir,
      nextVersion: '0.3.5',
      target: { os: 'linux' },
    })).rejects.toThrow(`Kaur Khor data directory was not found: ${resolve(missingDataDir)}`);
  });

  it('documents source-build checksum verification before extraction', () => {
    const installGuide = readFileSync('docs/install-guide.md', 'utf8');
    const shellSnippet = installGuide.slice(
      installGuide.indexOf('```sh'),
      installGuide.indexOf('```', installGuide.indexOf('```sh') + 1),
    );
    const powershellSnippet = installGuide.slice(
      installGuide.indexOf('```powershell'),
      installGuide.indexOf('```', installGuide.indexOf('```powershell') + 1),
    );

    expect(shellSnippet).toContain('kaur-khor-latest-source-build.tar.gz.sha256');
    expect(shellSnippet).toMatch(/shasum -a 256 -c|sha256sum -c/);
    expect(shellSnippet.indexOf('kaur-khor-latest-source-build.tar.gz.sha256')).toBeLessThan(
      shellSnippet.indexOf('tar -xzf kaur-khor-latest-source-build.tar.gz'),
    );
    expect(powershellSnippet).toContain('kaur-khor-latest-source-build.tar.gz.sha256');
    expect(powershellSnippet).toContain('Get-FileHash -Algorithm SHA256');
    expect(powershellSnippet.indexOf('Get-FileHash -Algorithm SHA256')).toBeLessThan(
      powershellSnippet.indexOf('tar -xzf "kaur-khor-latest-source-build.tar.gz"'),
    );
  });

  it('keeps platform-specific default data paths separate from app installs', () => {
    expect(defaultDataDirectoryForPlatform('mac')).toContain('Library/Application Support/KAUR KHOR');
    expect(defaultDataDirectoryForPlatform('windows')).toContain('KAUR KHOR');
    expect(defaultDataDirectoryForPlatform('linux')).toContain('KAUR KHOR');
  });
});
