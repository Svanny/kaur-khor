// @vitest-environment node

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupCloseSafetyDesktopBackupSnapshots,
  createAutomaticDesktopBackupSnapshot,
  createCloseSafetyDesktopBackupSnapshot,
  createDesktopBackupSnapshot,
  desktopBackupDirectoryPath,
  restoreWorkspaceFiles,
  restoreDesktopBackupSnapshot,
  clearCurrentDesktopData,
} from './local-backup';

describe('desktop local backup snapshots', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies current workspace files into a manual snapshot directory', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"en"}', 'utf8');

    const snapshot = await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    expect(snapshot.trigger).toBe('manual');
    expect(snapshot.fileCount).toBe(2);
    await expect(readFile(join(snapshot.snapshotPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('sqlite-data');
    await expect(readFile(join(snapshot.snapshotPath, 'desktop-preferences.json'), 'utf8')).resolves.toBe('{"language":"en"}');
    await expect(readFile(join(snapshot.snapshotPath, 'snapshot-manifest.json'), 'utf8')).resolves.toContain('"trigger": "manual"');
  });

  it('throttles automatic snapshots and prunes old snapshot directories', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-auto-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');

    const first = await createAutomaticDesktopBackupSnapshot({
      intervalMs: 60_000,
      maxSnapshots: 1,
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'preferences-save',
      userDataPath,
    });
    const skipped = await createAutomaticDesktopBackupSnapshot({
      intervalMs: 60_000,
      maxSnapshots: 1,
      now: () => new Date('2026-04-10T10:00:30.000Z'),
      reason: 'sena-trigger-run',
      userDataPath,
    });
    const second = await createAutomaticDesktopBackupSnapshot({
      intervalMs: 60_000,
      maxSnapshots: 1,
      now: () => new Date('2026-04-10T10:02:00.000Z'),
      reason: 'sena-trigger-run',
      userDataPath,
    });

    expect(first?.trigger).toBe('automatic');
    expect(skipped).toBeNull();
    expect(second?.trigger).toBe('automatic');

    const snapshotDirectories = (await readdir(desktopBackupDirectoryPath(userDataPath), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(snapshotDirectories).toHaveLength(1);
    expect(snapshotDirectories[0]).toContain('automatic-sena-trigger-run');
  });

  it('creates an unthrottled close-safety snapshot for live automation shutdown', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-close-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');

    const snapshot = await createCloseSafetyDesktopBackupSnapshot(userDataPath);

    expect(snapshot.trigger).toBe('automatic');
    expect(snapshot.snapshotPath).toContain('automatic-before-close-automation');
    await expect(readFile(join(snapshot.snapshotPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('sqlite-data');
  });

  it('keeps the newest close-safety snapshot and removes older close snapshots', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-close-cleanup-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');

    await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'before-close-automation',
      trigger: 'automatic',
      userDataPath,
    });
    await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:01:00.000Z'),
      reason: 'before-close-automation',
      trigger: 'automatic',
      userDataPath,
    });
    await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:02:00.000Z'),
      reason: 'preferences-save',
      trigger: 'automatic',
      userDataPath,
    });

    await cleanupCloseSafetyDesktopBackupSnapshots(userDataPath);

    const snapshotDirectories = (await readdir(desktopBackupDirectoryPath(userDataPath), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(snapshotDirectories).toEqual([
      '2026-04-10T10-01-00-000Z-automatic-before-close-automation',
      '2026-04-10T10-02-00-000Z-automatic-preferences-save',
    ]);
  });

  it('creates a safety snapshot and restores workspace files from a saved snapshot', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-restore-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'current-sqlite', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"en"}', 'utf8');

    const snapshot = await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'new-sqlite', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"km"}', 'utf8');

    const restored = await restoreDesktopBackupSnapshot({
      selectedPath: snapshot.snapshotPath,
      userDataPath,
    });

    expect(restored.restoredSnapshotPath).toBe(snapshot.snapshotPath);
    await expect(readFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('current-sqlite');
    await expect(readFile(join(userDataPath, 'desktop-preferences.json'), 'utf8')).resolves.toBe('{"language":"en"}');
    await expect(readFile(join(restored.safetySnapshot.snapshotPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('new-sqlite');
  });

  it('does not prune the selected snapshot while creating the restore safety snapshot', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-restore-prune-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'old-sqlite', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"en"}', 'utf8');

    const selectedSnapshot = await createDesktopBackupSnapshot({
      maxSnapshots: 30,
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    for (let index = 1; index <= 24; index += 1) {
      await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), `new-sqlite-${index}`, 'utf8');
      await createDesktopBackupSnapshot({
        maxSnapshots: 30,
        now: () => new Date(`2026-04-10T10:${String(index).padStart(2, '0')}:00.000Z`),
        reason: 'sena-ingest-observation',
        trigger: 'automatic',
        userDataPath,
      });
    }

    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'current-sqlite', 'utf8');

    const restored = await restoreDesktopBackupSnapshot({
      selectedPath: selectedSnapshot.snapshotPath,
      userDataPath,
    });

    expect(restored.restoredSnapshotPath).toBe(selectedSnapshot.snapshotPath);
    await expect(readFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('old-sqlite');
    await expect(readFile(join(selectedSnapshot.snapshotPath, 'desktop-preferences.json'), 'utf8')).resolves.toBe('{"language":"en"}');
  });

  it('captures SQLite sidecar files in the snapshot directory', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-wal-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3-wal'), 'wal-data', 'utf8');
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3-shm'), 'shm-data', 'utf8');

    const snapshot = await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    await expect(readFile(join(snapshot.snapshotPath, 'desktop-sena-store.sqlite3-wal'), 'utf8')).resolves.toBe('wal-data');
    await expect(readFile(join(snapshot.snapshotPath, 'desktop-sena-store.sqlite3-shm'), 'utf8')).resolves.toBe('shm-data');
  });

  it('creates a new directory when snapshot timestamps collide', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-collision-'));
    const now = () => new Date('2026-04-10T10:00:00.000Z');
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'first-sqlite', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"en"}', 'utf8');

    const first = await createDesktopBackupSnapshot({
      now,
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'second-sqlite', 'utf8');
    await rm(join(userDataPath, 'desktop-preferences.json'));

    const second = await createDesktopBackupSnapshot({
      now,
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    expect(second.snapshotPath).not.toBe(first.snapshotPath);
    await expect(readFile(join(first.snapshotPath, 'desktop-preferences.json'), 'utf8')).resolves.toBe('{"language":"en"}');
    await expect(readFile(join(second.snapshotPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('second-sqlite');
    await expect(readFile(join(second.snapshotPath, 'desktop-preferences.json'), 'utf8')).rejects.toThrow();
  });

  it('captures and restores nested workspace directories', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-nested-'));
    await mkdir(join(userDataPath, 'sena-checkpoints', 'sku-1'), { recursive: true });
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');
    await writeFile(join(userDataPath, 'sena-checkpoints', 'sku-1', 'checkpoint.json'), 'checkpoint-v1', 'utf8');

    const snapshot = await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    await writeFile(join(userDataPath, 'sena-checkpoints', 'sku-1', 'checkpoint.json'), 'checkpoint-v2', 'utf8');

    await restoreDesktopBackupSnapshot({
      selectedPath: snapshot.snapshotPath,
      userDataPath,
    });

    await expect(readFile(join(snapshot.snapshotPath, 'sena-checkpoints', 'sku-1', 'checkpoint.json'), 'utf8')).resolves.toBe('checkpoint-v1');
    await expect(readFile(join(userDataPath, 'sena-checkpoints', 'sku-1', 'checkpoint.json'), 'utf8')).resolves.toBe('checkpoint-v1');
  });

  it('clears nested workspace directories after creating a safety snapshot', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-clear-nested-'));
    await mkdir(join(userDataPath, 'sena-checkpoints', 'sku-1'), { recursive: true });
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'sqlite-data', 'utf8');
    await writeFile(join(userDataPath, 'sena-checkpoints', 'sku-1', 'checkpoint.json'), 'checkpoint-v1', 'utf8');

    const cleared = await clearCurrentDesktopData(userDataPath);

    expect(cleared.clearedFileCount).toBe(2);
    await expect(readdir(join(userDataPath, 'sena-checkpoints'))).rejects.toThrow();
    await expect(readFile(join(cleared.safetySnapshot.snapshotPath, 'sena-checkpoints', 'sku-1', 'checkpoint.json'), 'utf8')).resolves.toBe('checkpoint-v1');
  });

  it('restores the original workspace files if writing the snapshot back fails', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-backup-rollback-'));
    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'current-sqlite', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"en"}', 'utf8');

    const snapshot = await createDesktopBackupSnapshot({
      now: () => new Date('2026-04-10T10:00:00.000Z'),
      reason: 'settings',
      trigger: 'manual',
      userDataPath,
    });

    await writeFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'new-sqlite', 'utf8');
    await writeFile(join(userDataPath, 'desktop-preferences.json'), '{"language":"km"}', 'utf8');

    let restoreRenameCount = 0;
    const fileOps = {
      ...await import('node:fs/promises'),
      rename: async (sourcePath: string | Buffer | URL, destinationPath: string | Buffer | URL) => {
        if (typeof sourcePath === 'string' && sourcePath.includes('.kaur-khor-restore-staging-')) {
          restoreRenameCount += 1;
          if (restoreRenameCount === 1) {
            throw new Error('disk full');
          }
        }
        return (await import('node:fs/promises')).rename(sourcePath, destinationPath);
      },
    };

    await expect(
      restoreWorkspaceFiles(
        userDataPath,
        [
          join(snapshot.snapshotPath, 'desktop-sena-store.sqlite3'),
          join(snapshot.snapshotPath, 'desktop-preferences.json'),
        ],
        fileOps,
      ),
    ).rejects.toThrow('disk full');

    await expect(readFile(join(userDataPath, 'desktop-sena-store.sqlite3'), 'utf8')).resolves.toBe('new-sqlite');
    await expect(readFile(join(userDataPath, 'desktop-preferences.json'), 'utf8')).resolves.toBe('{"language":"km"}');
  });
});
