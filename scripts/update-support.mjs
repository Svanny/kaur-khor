import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

export const SOURCE_BUILD_VERSIONED_SUFFIX = 'source-build.tar.gz';
export const SOURCE_BUILD_LATEST_BASE_NAME = 'kaur-khor-latest-source-build';
export const SOURCE_BUILD_LEGACY_BASE_NAME = 'kaur-khor-source-build';

const PRODUCT_NAME = 'KAUR KHOR';
const MAC_APP_PATH = `/Applications/${PRODUCT_NAME}.app`;
const APP_ID = 'com.svanny.kaur-khor';
const PACKAGE_NAME = 'kaur-khor';

export function sourceBuildArchiveNames(version) {
  const normalizedVersion = String(version).replace(/^v/, '');
  const tag = `v${normalizedVersion}`;
  return {
    tag,
    versionedBaseName: `kaur-khor-${tag}-source-build`,
    versionedArchiveName: `kaur-khor-${tag}-${SOURCE_BUILD_VERSIONED_SUFFIX}`,
    latestBaseName: SOURCE_BUILD_LATEST_BASE_NAME,
    latestArchiveName: `${SOURCE_BUILD_LATEST_BASE_NAME}.tar.gz`,
    legacyBaseName: SOURCE_BUILD_LEGACY_BASE_NAME,
    legacyArchiveName: `${SOURCE_BUILD_LEGACY_BASE_NAME}.tar.gz`,
  };
}

export function defaultDataDirectoryForPlatform(targetOs = process.platform) {
  if (targetOs === 'darwin' || targetOs === 'mac') {
    return join(homedir(), 'Library', 'Application Support', PRODUCT_NAME);
  }

  if (targetOs === 'win32' || targetOs === 'windows') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), PRODUCT_NAME);
  }

  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), PRODUCT_NAME);
}

export function timestampToken(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, '-');
}

export function preUpdateBackupName({ currentVersion, nextVersion, now = new Date() }) {
  const fromVersion = currentVersion ? `v${String(currentVersion).replace(/^v/, '')}` : 'unknown';
  const toVersion = nextVersion ? `v${String(nextVersion).replace(/^v/, '')}` : 'latest';
  return `kaur-khor-pre-update-${fromVersion}-to-${toVersion}-${timestampToken(now)}`;
}

export function resolveUpdateDataDirectory(explicitDataDir, targetOs = process.platform) {
  if (typeof explicitDataDir === 'string' && explicitDataDir.trim().length > 0) {
    const explicitPath = resolve(explicitDataDir);
    if (!existsSync(explicitPath)) {
      throw new Error(`Kaur Khor data directory was not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const candidates = [
    process.env.KAUR_KHOR_DESKTOP_DATA_DIR,
    defaultDataDirectoryForPlatform(targetOs),
  ].filter((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);

  return candidates.find((candidate) => existsSync(resolve(candidate))) ?? resolve(candidates[0] ?? defaultDataDirectoryForPlatform(targetOs));
}

export function createPreUpdateBackup({
  backupDir,
  currentVersion,
  dataDir,
  nextVersion,
  now = new Date(),
}) {
  if (!backupDir) {
    throw new Error('A backup directory is required.');
  }

  const resolvedDataDir = resolve(dataDir);
  if (!existsSync(resolvedDataDir)) {
    throw new Error(`Kaur Khor data directory was not found: ${resolvedDataDir}`);
  }

  const stats = statSync(resolvedDataDir);
  if (!stats.isDirectory()) {
    throw new Error(`Kaur Khor data path is not a directory: ${resolvedDataDir}`);
  }

  const backupRoot = resolve(backupDir);
  mkdirSync(backupRoot, { recursive: true });
  const backupPath = resolve(backupRoot, preUpdateBackupName({ currentVersion, nextVersion, now }));
  mkdirSync(backupPath, { recursive: true });

  for (const entry of readdirSync(resolvedDataDir, { withFileTypes: true })) {
    const sourcePath = resolve(resolvedDataDir, entry.name);
    if (
      entry.name.endsWith('.tmp') ||
      entry.name.startsWith('.kaur-khor-update-') ||
      isSamePath(backupRoot, sourcePath) ||
      isSamePath(backupPath, sourcePath)
    ) {
      continue;
    }

    copyBackupEntry(sourcePath, resolve(backupPath, entry.name), backupPath);
  }

  return backupPath;
}

function isPathInsideOrSame(candidatePath, rootPath) {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isSamePath(leftPath, rightPath) {
  return resolve(leftPath) === resolve(rightPath);
}

function copyBackupEntry(sourcePath, destinationPath, backupRoot) {
  if (lstatSync(sourcePath).isSymbolicLink()) {
    return;
  }

  cpSync(sourcePath, destinationPath, {
    filter: (currentSourcePath) => !lstatSync(currentSourcePath).isSymbolicLink() && !isPathInsideOrSame(currentSourcePath, backupRoot),
    force: true,
    recursive: true,
  });
}

function dataDirectoryCanBeBackedUp(dataDir) {
  if (!dataDir) {
    return false;
  }

  const resolvedDataDir = resolve(dataDir);
  return existsSync(resolvedDataDir) && statSync(resolvedDataDir).isDirectory();
}

export function detectInstalledApp(targetOs = process.platform) {
  if (targetOs === 'darwin' || targetOs === 'mac') {
    return detectInstalledMacApp();
  }

  if (targetOs === 'win32' || targetOs === 'windows') {
    return detectInstalledWindowsApp();
  }

  return detectInstalledLinuxPackage();
}

function detectInstalledMacApp() {
  if (!existsSync(MAC_APP_PATH)) {
    return { installed: false, installPath: MAC_APP_PATH, version: null };
  }

  const plistPath = join(MAC_APP_PATH, 'Contents', 'Info.plist');
  let version = null;
  const plistBuddy = '/usr/libexec/PlistBuddy';
  if (existsSync(plistBuddy) && existsSync(plistPath)) {
    const result = spawnSync(plistBuddy, ['-c', 'Print :CFBundleShortVersionString', plistPath], {
      encoding: 'utf8',
    });
    version = result.status === 0 ? result.stdout.trim() || null : null;
  }

  return {
    installed: true,
    installPath: MAC_APP_PATH,
    version,
  };
}

function detectInstalledLinuxPackage() {
  const result = spawnSync('dpkg-query', ['-W', '-f=${Version}', PACKAGE_NAME], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return { installed: false, installPath: null, version: null };
  }

  return {
    installed: true,
    installPath: PACKAGE_NAME,
    version: result.stdout.trim() || null,
  };
}

function detectInstalledWindowsApp() {
  const keys = [
    String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`,
    String.raw`HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall`,
    String.raw`HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`,
  ];

  for (const key of keys) {
    const result = spawnSync('reg', ['query', key, '/s'], { encoding: 'utf8' });
    if (result.status !== 0) {
      continue;
    }

    const blocks = result.stdout.split(/\r?\n\r?\n/);
    const match = blocks.find((block) =>
      block.includes(PRODUCT_NAME) || block.toLowerCase().includes(APP_ID),
    );
    if (!match) {
      continue;
    }

    return {
      installed: true,
      installPath: readRegistryValue(match, 'InstallLocation'),
      uninstallString: readRegistryValue(match, 'UninstallString'),
      version: readRegistryValue(match, 'DisplayVersion'),
    };
  }

  return { installed: false, installPath: null, uninstallString: null, version: null };
}

function readRegistryValue(block, name) {
  const line = block.split(/\r?\n/).find((entry) => entry.trim().startsWith(name));
  if (!line) {
    return null;
  }
  return line.replace(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+`), '').trim() || null;
}

export async function prepareSourceBuildUpdate({
  backupDir,
  dataDir,
  nextVersion,
  noUninstall = false,
  prompt = true,
  promptForBackupDirectory = promptForBackupDirectoryFromStdin,
  skipBackup = false,
  target,
}) {
  const installed = detectInstalledApp(target?.os ?? platform());
  const resolvedDataDir = resolveUpdateDataDirectory(dataDir, target?.os ?? platform());

  console.log(`Installed Kaur Khor version: ${installed.version ?? (installed.installed ? 'unknown' : 'not installed')}`);
  console.log(`Update target version: ${nextVersion ?? 'latest'}`);
  console.log(`Detected data directory: ${resolvedDataDir}`);

  let backupPath = null;
  if (!skipBackup && !dataDirectoryCanBeBackedUp(resolvedDataDir)) {
    skipBackup = true;
    console.log('No existing Kaur Khor data directory was found, so there is no pre-update snapshot to export.');
  }

  if (!skipBackup) {
    let resolvedBackupDir = backupDir ?? null;
    if (!resolvedBackupDir && prompt) {
      const promptResult = await promptForBackupDirectory();
      if (promptResult.action === 'skip') {
        skipBackup = true;
      } else {
        resolvedBackupDir = promptResult.path;
      }
    }
    if (!skipBackup && !resolvedBackupDir) {
      throw new Error('Update cancelled because no backup directory was selected.');
    }
    if (!skipBackup) {
      backupPath = createPreUpdateBackup({
        backupDir: resolvedBackupDir,
        currentVersion: installed.version,
        dataDir: resolvedDataDir,
        nextVersion,
      });
      console.log(`Wrote pre-update snapshot export to ${backupPath}`);
    }
  }

  if (skipBackup) {
    console.log('Skipping pre-update snapshot export because backup was skipped.');
  }

  if (noUninstall) {
    console.log('Skipping explicit uninstall because --no-uninstall was supplied.');
  }

  return {
    backupPath,
    dataDir: resolvedDataDir,
    installed,
  };
}

export function parseBackupDirectoryPromptAnswer(answer) {
  const trimmed = answer.trim();
  if (/^cancel$/i.test(trimmed)) {
    throw new Error('Update cancelled by user.');
  }
  if (/^skip$/i.test(trimmed)) {
    return { action: 'skip' };
  }
  if (!trimmed) {
    throw new Error('Update cancelled because no backup folder was entered.');
  }
  return { action: 'backup', path: trimmed };
}

async function promptForBackupDirectoryFromStdin() {
  const nativeResult = promptForBackupDirectoryWithNativeDialog();
  if (nativeResult) {
    return nativeResult;
  }

  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(
      'Choose a folder for the pre-update snapshot export, or type SKIP/CANCEL: ',
    );
    return parseBackupDirectoryPromptAnswer(answer);
  } finally {
    readline.close();
  }
}

function promptForBackupDirectoryWithNativeDialog(targetOs = process.platform) {
  if (targetOs === 'darwin') {
    const result = spawnSync('osascript', [
      '-e',
      'POSIX path of (choose folder with prompt "Choose where Kaur Khor should export the pre-update snapshot.")',
    ], {
      encoding: 'utf8',
    });
    return nativeFolderPromptResult(result);
  }

  if (targetOs === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-Command',
      [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
        '$dialog.Description = "Choose where Kaur Khor should export the pre-update snapshot.";',
        '$dialog.ShowNewFolderButton = $true;',
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
      ].join(' '),
    ], {
      encoding: 'utf8',
    });
    return nativeFolderPromptResult(result);
  }

  for (const command of [
    {
      args: ['--file-selection', '--directory', '--title=Choose Kaur Khor pre-update snapshot export folder'],
      name: 'zenity',
    },
    {
      args: ['--getexistingdirectory', homedir(), 'Choose Kaur Khor pre-update snapshot export folder'],
      name: 'kdialog',
    },
  ]) {
    const result = spawnSync(command.name, command.args, { encoding: 'utf8' });
    const promptResult = nativeFolderPromptResult(result);
    if (promptResult) {
      return promptResult;
    }
  }

  return null;
}

function nativeFolderPromptResult(result) {
  if (result.status !== 0) {
    return null;
  }

  const selectedPath = result.stdout.trim();
  if (!selectedPath) {
    return null;
  }

  return { action: 'backup', path: selectedPath };
}

export function releaseVersionFromSourceRoot(sourceRoot) {
  const markerPath = resolve(sourceRoot, '.kaur-khor-source-build-release');
  if (existsSync(markerPath)) {
    return readFileSync(markerPath, 'utf8').trim().replace(/^v/, '');
  }

  const packageJsonPath = resolve(sourceRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version ?? null;
  }

  return null;
}

export function latestDownloadSnippetArchiveName() {
  return `${SOURCE_BUILD_LATEST_BASE_NAME}.tar.gz`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  if (command === 'detect') {
    console.log(JSON.stringify(detectInstalledApp(), null, 2));
  } else {
    console.log(JSON.stringify({
      defaultDataDirectory: defaultDataDirectoryForPlatform(),
      latestArchiveName: latestDownloadSnippetArchiveName(),
      tempDirectory: tmpdir(),
      currentDirectory: basename(process.cwd()),
    }, null, 2));
  }
}
