// @vitest-environment node

import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createAutomaticDesktopBackupSnapshot,
  createDesktopBackupSnapshot,
  desktopBackupDirectoryPath,
  restoreDesktopBackupSnapshot,
} from './local-backup';

describe('desktop local backup snapshots', () => {
  it('copies current workspace files into a manual snapshot directory', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-backup-'));
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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-backup-auto-'));
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

  it('creates a safety snapshot and restores workspace files from a saved snapshot', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-backup-restore-'));
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
});
