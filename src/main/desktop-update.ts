import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App } from 'electron';
import type {
  DesktopUpdateCheckResult,
  DesktopUpdateRunPayload,
  DesktopUpdateRunResult,
} from '@shared/ipc';

const RELEASE_API_URL = 'https://api.github.com/repos/Svanny/kaur-khor/releases/latest';
const SOURCE_ARCHIVE_URL =
  'https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz';

interface GitHubReleaseResponse {
  html_url?: string;
  tag_name?: string;
}

export async function checkForKaurKhorUpdate({
  appVersion,
  platform,
}: {
  appVersion: string;
  platform: NodeJS.Platform;
}): Promise<DesktopUpdateCheckResult> {
  const release = await fetchLatestRelease();
  const latestVersion = release.tag_name?.replace(/^v/, '') ?? null;
  const isUpdateAvailable = latestVersion ? compareVersions(latestVersion, appVersion) > 0 : false;
  const isPlatformSupported =
    platform === 'darwin' || platform === 'linux' || platform === 'win32';

  return {
    currentVersion: appVersion,
    isPlatformSupported,
    isUpdateAvailable,
    latestVersion,
    releaseTag: release.tag_name ?? null,
    releaseUrl: release.html_url ?? 'https://github.com/Svanny/kaur-khor/releases/latest',
  };
}

export async function launchKaurKhorSourceUpdate({
  app,
  appVersion,
  dataDirectoryPath,
  payload,
}: {
  app: App;
  appVersion: string;
  dataDirectoryPath: string;
  payload: DesktopUpdateRunPayload;
}): Promise<DesktopUpdateRunResult> {
  const backupDirectoryPath = payload.backupDirectoryPath?.trim() || null;
  if (!backupDirectoryPath && !payload.skipBackup) {
    throw new Error('Choose a snapshot export folder or skip backup before installing an update.');
  }

  const scriptPath = await writeUpdaterScript({
    appVersion,
    backupDirectoryPath,
    dataDirectoryPath: payload.dataDirectoryPath?.trim() || dataDirectoryPath,
    skipBackup: payload.skipBackup === true,
  });

  launchScriptInTerminal(scriptPath);
  setTimeout(() => app.quit(), 250);
  return {
    started: true,
    message: 'Kaur Khor will close while the updater builds and installs the latest release.',
  };
}

async function fetchLatestRelease(): Promise<GitHubReleaseResponse> {
  const body = await downloadText(RELEASE_API_URL);
  return JSON.parse(body) as GitHubReleaseResponse;
}

function downloadText(url: string): Promise<string> {
  return new Promise((resolveDownload, rejectDownload) => {
    const req = httpsRequest(url, { headers: { 'User-Agent': 'kaur-khor-desktop-updater' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadText(new URL(response.headers.location, url).toString()).then(resolveDownload, rejectDownload);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        rejectDownload(new Error(`GitHub release lookup failed with HTTP ${response.statusCode}.`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolveDownload(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', rejectDownload);
    req.end();
  });
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }
  return 0;
}

async function writeUpdaterScript({
  appVersion,
  backupDirectoryPath,
  dataDirectoryPath,
  skipBackup,
}: {
  appVersion: string;
  backupDirectoryPath: string | null;
  dataDirectoryPath: string;
  skipBackup: boolean;
}) {
  const updateDirectory = join(tmpdir(), `kaur-khor-update-${Date.now()}`);
  await mkdir(updateDirectory, { recursive: true });

  if (process.platform === 'win32') {
    const scriptPath = join(updateDirectory, 'update-kaur-khor.ps1');
    await writeFile(scriptPath, windowsUpdateScript({ backupDirectoryPath, dataDirectoryPath, skipBackup }), 'utf8');
    return scriptPath;
  }

  const scriptPath = join(updateDirectory, 'update-kaur-khor.sh');
  await writeFile(scriptPath, shellUpdateScript({ appVersion, backupDirectoryPath, dataDirectoryPath, skipBackup }), {
    encoding: 'utf8',
    mode: 0o755,
  });
  return scriptPath;
}

function shellUpdateScript({
  appVersion,
  backupDirectoryPath,
  dataDirectoryPath,
  skipBackup,
}: {
  appVersion: string;
  backupDirectoryPath: string | null;
  dataDirectoryPath: string;
  skipBackup: boolean;
}) {
  const backupArg = backupDirectoryPath ? ` --backup-dir=${shellQuote(backupDirectoryPath)}` : '';
  const skipArg = skipBackup ? ' --skip-backup' : '';
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Updating Kaur Khor from v${appVersion} to the latest release..."
curl -fL ${shellQuote(SOURCE_ARCHIVE_URL)} -o kaur-khor-latest-source-build.tar.gz
tar -xzf kaur-khor-latest-source-build.tar.gz
cd kaur-khor-*-source-build
./scripts/build-from-source.sh --update --data-dir=${shellQuote(dataDirectoryPath)}${backupArg}${skipArg}
echo "Update finished. Reopen Kaur Khor and restore the exported snapshot from your chosen backup folder if needed."
`;
}

function windowsUpdateScript({
  backupDirectoryPath,
  dataDirectoryPath,
  skipBackup,
}: {
  backupDirectoryPath: string | null;
  dataDirectoryPath: string;
  skipBackup: boolean;
}) {
  const backupArg = backupDirectoryPath ? ` --backup-dir="${backupDirectoryPath.replaceAll('"', '`"')}"` : '';
  const skipArg = skipBackup ? ' --skip-backup' : '';
  return `$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Updating Kaur Khor to the latest release..."
Invoke-WebRequest -Uri "${SOURCE_ARCHIVE_URL}" -OutFile "kaur-khor-latest-source-build.tar.gz"
tar -xzf "kaur-khor-latest-source-build.tar.gz"
Set-Location "kaur-khor-*-source-build"
.\\scripts\\build-from-source.ps1 --update --data-dir="${dataDirectoryPath.replaceAll('"', '`"')}"${backupArg}${skipArg}
Write-Host "Update finished. Reopen Kaur Khor and restore the exported snapshot from your chosen backup folder if needed."
`;
}

function launchScriptInTerminal(scriptPath: string) {
  if (process.platform === 'darwin') {
    spawn('osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(scriptPath)}`], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  if (process.platform === 'win32') {
    spawn('powershell.exe', ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();
    return;
  }

  const terminal = process.env.TERM_PROGRAM || 'x-terminal-emulator';
  spawn(terminal, ['-e', scriptPath], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
