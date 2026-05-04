import * as fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type {
  DesktopBackupRestoreResult,
  DesktopBackupSnapshotResult,
  DesktopClearCurrentDataResult,
} from '@shared/ipc';

interface CreateDesktopBackupSnapshotOptions {
  maxSnapshots?: number;
  now?: () => Date;
  preserveSnapshotPaths?: string[];
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
const CLOSE_AUTOMATION_SNAPSHOT_REASON = 'before-close-automation';
const CLOSE_AUTOMATION_SNAPSHOT_SUFFIX = `automatic-${CLOSE_AUTOMATION_SNAPSHOT_REASON}`;
const DEFAULT_AUTOMATIC_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_BACKUP_SNAPSHOTS = 24;
const backupQueues = new Map<string, Promise<unknown>>();
const lastAutomaticSnapshotAt = new Map<string, number>();
type FileOps = Pick<typeof fs, 'copyFile' | 'cp' | 'mkdir' | 'readdir' | 'readFile' | 'rename' | 'rm' | 'stat' | 'writeFile'>;

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

async function listSnapshotSourceFiles(userDataPath: string, fileOps: FileOps = fs) {
  await fileOps.mkdir(userDataPath, { recursive: true });
  const entries = await fileOps.readdir(userDataPath, { withFileTypes: true });
  return entries
    .filter((entry) =>
      (entry.isFile() || entry.isDirectory())
      && entry.name !== BACKUP_DIRECTORY_NAME
      && !entry.name.startsWith('.kaur-khor-')
      && !entry.name.endsWith('.tmp'),
    )
    .map((entry) => join(userDataPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function listRestorableSnapshotFiles(snapshotPath: string, fileOps: FileOps = fs) {
  const entries = await fileOps.readdir(snapshotPath, { withFileTypes: true });
  return entries
    .filter((entry) =>
      (entry.isFile() || entry.isDirectory())
      && entry.name !== SNAPSHOT_MANIFEST_FILENAME
      && !entry.name.endsWith('.tmp'),
    )
    .map((entry) => join(snapshotPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function pruneOldSnapshots(userDataPath: string, maxSnapshots: number, preserveSnapshotPaths: string[] = []) {
  const backupDirectoryPath = desktopBackupDirectoryPath(userDataPath);
  const preservedSnapshotNames = new Set(preserveSnapshotPaths.map((snapshotPath) => basename(snapshotPath)));
  const entries = await fs.readdir(backupDirectoryPath, { withFileTypes: true }).catch(() => []);
  const snapshotDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((entryName) => !preservedSnapshotNames.has(entryName))
    .sort((left, right) => right.localeCompare(left));

  for (const snapshotName of snapshotDirectories.slice(maxSnapshots)) {
    await fs.rm(join(backupDirectoryPath, snapshotName), { force: true, recursive: true });
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

function temporaryWorkspaceDirectoryPath(userDataPath: string, label: string, now = new Date()) {
  return join(userDataPath, `.kaur-khor-${label}-${timestampToken(now)}`);
}

async function removePaths(paths: string[], fileOps: FileOps = fs) {
  await Promise.all(paths.map((path) => fileOps.rm(path, { force: true, recursive: true })));
}

async function copyFilesIntoDirectory(sourceFiles: string[], directoryPath: string, fileOps: FileOps = fs) {
  await fileOps.mkdir(directoryPath, { recursive: true });
  for (const sourcePath of sourceFiles) {
    const targetPath = join(directoryPath, basename(sourcePath));
    const sourceStats = await fileOps.stat(sourcePath);
    if (sourceStats.isDirectory()) {
      await fileOps.cp(sourcePath, targetPath, { recursive: true });
      continue;
    }
    await fileOps.copyFile(sourcePath, targetPath);
  }
}

async function moveFilesIntoDirectory(sourceFiles: string[], directoryPath: string, fileOps: FileOps = fs) {
  await fileOps.mkdir(directoryPath, { recursive: true });
  for (const sourcePath of sourceFiles) {
    await fileOps.rename(sourcePath, join(directoryPath, basename(sourcePath)));
  }
}

export async function restoreWorkspaceFiles(
  userDataPath: string,
  snapshotFiles: string[],
  fileOps: FileOps = fs,
) {
  const timestamp = new Date();
  const stagedSnapshotDirectoryPath = temporaryWorkspaceDirectoryPath(
    userDataPath,
    'restore-staging',
    timestamp,
  );
  const rollbackDirectoryPath = temporaryWorkspaceDirectoryPath(
    userDataPath,
    'restore-rollback',
    timestamp,
  );
  const restoredPaths: string[] = [];

  try {
    await copyFilesIntoDirectory(snapshotFiles, stagedSnapshotDirectoryPath, fileOps);
    const currentFiles = await listSnapshotSourceFiles(userDataPath, fileOps);
    await moveFilesIntoDirectory(currentFiles, rollbackDirectoryPath, fileOps);

    const stagedFiles = await listRestorableSnapshotFiles(stagedSnapshotDirectoryPath, fileOps);
    for (const stagedFile of stagedFiles) {
      const destinationPath = join(userDataPath, basename(stagedFile));
      await fileOps.rename(stagedFile, destinationPath);
      restoredPaths.push(destinationPath);
    }

    await fileOps.rm(stagedSnapshotDirectoryPath, { force: true, recursive: true });
    await fileOps.rm(rollbackDirectoryPath, { force: true, recursive: true });
  } catch (error) {
    await removePaths(restoredPaths, fileOps);
    const rollbackFiles = await listRestorableSnapshotFiles(rollbackDirectoryPath, fileOps).catch(() => []);
    for (const rollbackFile of rollbackFiles) {
      await fileOps.rename(rollbackFile, join(userDataPath, basename(rollbackFile)));
    }
    await fileOps.rm(stagedSnapshotDirectoryPath, { force: true, recursive: true }).catch(() => undefined);
    await fileOps.rm(rollbackDirectoryPath, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

async function createDesktopBackupSnapshotUnchecked({
  maxSnapshots = DEFAULT_MAX_BACKUP_SNAPSHOTS,
  now = () => new Date(),
  preserveSnapshotPaths,
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

  await copyFilesIntoDirectory(sourceFiles, snapshotPath, fs);
  await fs.writeFile(
    join(snapshotPath, SNAPSHOT_MANIFEST_FILENAME),
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
  await pruneOldSnapshots(userDataPath, maxSnapshots, preserveSnapshotPaths);

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

export async function createCloseSafetyDesktopBackupSnapshot(
  userDataPath: string,
): Promise<DesktopBackupSnapshotResult> {
  return createDesktopBackupSnapshot({
    reason: CLOSE_AUTOMATION_SNAPSHOT_REASON,
    trigger: 'automatic',
    userDataPath,
  });
}

export async function cleanupCloseSafetyDesktopBackupSnapshots(userDataPath: string) {
  return runBackupQueue(userDataPath, async () => {
    const backupDirectoryPath = desktopBackupDirectoryPath(userDataPath);
    const entries = await fs.readdir(backupDirectoryPath, { withFileTypes: true }).catch(() => []);
    const closeSafetySnapshotNames = entries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(CLOSE_AUTOMATION_SNAPSHOT_SUFFIX))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));

    for (const snapshotName of closeSafetySnapshotNames.slice(1)) {
      await fs.rm(join(backupDirectoryPath, snapshotName), { force: true, recursive: true });
    }
  });
}

async function resolveSnapshotDirectory(selectedPath: string) {
  const selectedStats = await fs.stat(selectedPath);
  const snapshotPath = selectedStats.isDirectory() ? selectedPath : dirname(selectedPath);
  const manifestPath = join(snapshotPath, SNAPSHOT_MANIFEST_FILENAME);
  await fs.readFile(manifestPath, 'utf8');
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
      preserveSnapshotPaths: [snapshotPath],
      reason: 'before-restore',
      trigger: 'manual',
      userDataPath,
    });
    await restoreWorkspaceFiles(userDataPath, snapshotFiles);

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

    await removePaths(currentFiles);

    return {
      clearedFileCount: currentFiles.length,
      safetySnapshot,
    };
  });
}
