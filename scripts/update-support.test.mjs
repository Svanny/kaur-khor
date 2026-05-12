import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('keeps platform-specific default data paths separate from app installs', () => {
    expect(defaultDataDirectoryForPlatform('mac')).toContain('Library/Application Support/KAUR KHOR');
    expect(defaultDataDirectoryForPlatform('windows')).toContain('KAUR KHOR');
    expect(defaultDataDirectoryForPlatform('linux')).toContain('KAUR KHOR');
  });
});
