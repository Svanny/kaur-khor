import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type {
  DesktopBackupRestoreResult,
  DesktopBackupSnapshotResult,
  DesktopClearCurrentDataResult,
} from '@shared/ipc';

interface CreateDesktopBackupSnapshotOptions {
  maxSnapshots?: number;
  now?: () => Date;
  reason?: string;
  trigger: 'manual' | 'automatic';
  userDataPath: string;
}

interface AutomaticDesktopBackupOptions {
  intervalMs?: number;
  maxSnapshots?: number;
  now?: () => Date;
  reason: string;
  userDataPath: string;
}

interface RestoreDesktopBackupSnapshotOptions {
  selectedPath: string;
  userDataPath: string;
}

const BACKUP_DIRECTORY_NAME = 'backup-snapshots';
const SNAPSHOT_MANIFEST_FILENAME = 'snapshot-manifest.json';
const DEFAULT_AUTOMATIC_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_BACKUP_SNAPSHOTS = 24;
const backupQueues = new Map<string, Promise<unknown>>();
const lastAutomaticSnapshotAt = new Map<string, number>();

export function desktopBackupDirectoryPath(userDataPath: string) {
  return join(userDataPath, BACKUP_DIRECTORY_NAME);
}

function timestampToken(value: Date) {
  return value.toISOString().replace(/[:.]/g, '-');
}

function slugifyReason(reason: string | undefined) {
  if (!reason) {
    return '';
  }
  return reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function listSnapshotSourceFiles(userDataPath: string) {
  await mkdir(userDataPath, { recursive: true });
  const entries = await readdir(userDataPath, { withFileTypes: true });
  return entries
    .filter((entry) =>
      entry.isFile()
      && entry.name !== BACKUP_DIRECTORY_NAME
      && !entry.name.endsWith('.tmp'),
    )
    .map((entry) => join(userDataPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function listRestorableSnapshotFiles(snapshotPath: string) {
  const entries = await readdir(snapshotPath, { withFileTypes: true });
  return entries
    .filter((entry) =>
      entry.isFile()
      && entry.name !== SNAPSHOT_MANIFEST_FILENAME
      && !entry.name.endsWith('.tmp'),
    )
    .map((entry) => join(snapshotPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function pruneOldSnapshots(userDataPath: string, maxSnapshots: number) {
  const backupDirectoryPath = desktopBackupDirectoryPath(userDataPath);
  const entries = await readdir(backupDirectoryPath, { withFileTypes: true }).catch(() => []);
  const snapshotDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const snapshotName of snapshotDirectories.slice(maxSnapshots)) {
    await rm(join(backupDirectoryPath, snapshotName), { force: true, recursive: true });
  }
}

function runBackupQueue<T>(userDataPath: string, task: () => Promise<T>): Promise<T> {
  const previous = backupQueues.get(userDataPath) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task);
  backupQueues.set(
    userDataPath,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function createDesktopBackupSnapshotUnchecked({
  maxSnapshots = DEFAULT_MAX_BACKUP_SNAPSHOTS,
  now = () => new Date(),
  reason,
  trigger,
  userDataPath,
}: CreateDesktopBackupSnapshotOptions): Promise<DesktopBackupSnapshotResult> {
  const createdAtValue = now();
  const createdAt = createdAtValue.toISOString();
  const reasonToken = slugifyReason(reason);
  const snapshotDirectoryName = [timestampToken(createdAtValue), trigger, reasonToken]
    .filter(Boolean)
    .join('-');
  const backupDirectoryPath = desktopBackupDirectoryPath(userDataPath);
  const snapshotPath = join(backupDirectoryPath, snapshotDirectoryName);
  const sourceFiles = await listSnapshotSourceFiles(userDataPath);

  await mkdir(snapshotPath, { recursive: true });
  for (const sourcePath of sourceFiles) {
    await copyFile(sourcePath, join(snapshotPath, basename(sourcePath)));
  }
  await writeFile(
    join(snapshotPath, 'snapshot-manifest.json'),
    JSON.stringify(
      {
        createdAt,
        fileCount: sourceFiles.length,
        snapshotPath,
        sourceFiles: sourceFiles.map((sourcePath) => basename(sourcePath)),
        trigger,
      },
      null,
      2,
    ),
    'utf8',
  );
  await pruneOldSnapshots(userDataPath, maxSnapshots);

  return {
    createdAt,
    fileCount: sourceFiles.length,
    snapshotPath,
    trigger,
  };
}

export async function createDesktopBackupSnapshot(
  options: CreateDesktopBackupSnapshotOptions,
): Promise<DesktopBackupSnapshotResult> {
  return runBackupQueue(options.userDataPath, () => createDesktopBackupSnapshotUnchecked(options));
}

export async function createAutomaticDesktopBackupSnapshot({
  intervalMs = DEFAULT_AUTOMATIC_SNAPSHOT_INTERVAL_MS,
  maxSnapshots = DEFAULT_MAX_BACKUP_SNAPSHOTS,
  now = () => new Date(),
  reason,
  userDataPath,
}: AutomaticDesktopBackupOptions): Promise<DesktopBackupSnapshotResult | null> {
  return runBackupQueue(userDataPath, async () => {
    const nowValue = now();
    const lastSnapshotAt = lastAutomaticSnapshotAt.get(userDataPath) ?? 0;
    if (nowValue.getTime() - lastSnapshotAt < intervalMs) {
      return null;
    }

    const snapshot = await createDesktopBackupSnapshotUnchecked({
      maxSnapshots,
      now: () => nowValue,
      reason,
      trigger: 'automatic',
      userDataPath,
    });
    lastAutomaticSnapshotAt.set(userDataPath, nowValue.getTime());
    return snapshot;
  });
}

async function resolveSnapshotDirectory(selectedPath: string) {
  const selectedStats = await stat(selectedPath);
  const snapshotPath = selectedStats.isDirectory() ? selectedPath : dirname(selectedPath);
  const manifestPath = join(snapshotPath, SNAPSHOT_MANIFEST_FILENAME);
  await readFile(manifestPath, 'utf8');
  return snapshotPath;
}

export async function restoreDesktopBackupSnapshot({
  selectedPath,
  userDataPath,
}: RestoreDesktopBackupSnapshotOptions): Promise<DesktopBackupRestoreResult> {
  return runBackupQueue(userDataPath, async () => {
    const snapshotPath = await resolveSnapshotDirectory(selectedPath);
    const snapshotFiles = await listRestorableSnapshotFiles(snapshotPath);
    if (snapshotFiles.length === 0) {
      throw new Error('The selected snapshot does not contain any restorable workspace files.');
    }

    const safetySnapshot = await createDesktopBackupSnapshotUnchecked({
      reason: 'before-restore',
      trigger: 'manual',
      userDataPath,
    });
    const currentFiles = await listSnapshotSourceFiles(userDataPath);

    for (const currentPath of currentFiles) {
      await rm(currentPath, { force: true });
    }
    for (const snapshotFile of snapshotFiles) {
      await copyFile(snapshotFile, join(userDataPath, basename(snapshotFile)));
    }

    return {
      restoredSnapshotPath: snapshotPath,
      safetySnapshot,
    };
  });
}

export async function clearCurrentDesktopData(
  userDataPath: string,
): Promise<DesktopClearCurrentDataResult> {
  return runBackupQueue(userDataPath, async () => {
    const safetySnapshot = await createDesktopBackupSnapshotUnchecked({
      reason: 'before-clear',
      trigger: 'manual',
      userDataPath,
    });
    const currentFiles = await listSnapshotSourceFiles(userDataPath);

    for (const currentPath of currentFiles) {
      await rm(currentPath, { force: true });
    }

    return {
      clearedFileCount: currentFiles.length,
      safetySnapshot,
    };
  });
}
