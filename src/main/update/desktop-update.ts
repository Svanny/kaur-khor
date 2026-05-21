import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App } from 'electron';
import type {
  DesktopUpdateCheckResult,
  DesktopUpdateRunPayload,
  DesktopUpdateRunResult,
  DesktopUpdateVersionOption,
} from '@shared/ipc';

const RELEASE_API_URL = 'https://api.github.com/repos/Svanny/kaur-khor/releases/latest';
const RELEASES_API_URL = 'https://api.github.com/repos/Svanny/kaur-khor/releases?per_page=20';
const RELEASES_PAGE_URL = 'https://github.com/Svanny/kaur-khor/releases';
const RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/Svanny/kaur-khor/releases/download';
const LATEST_RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/Svanny/kaur-khor/releases/latest/download';
const MAX_RELEASE_LOOKUP_REDIRECTS = 5;
const SOURCE_VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

interface GitHubReleaseResponse {
  html_url?: string;
  prerelease?: boolean;
  tag_name?: string;
}

interface NormalizedDesktopUpdateRunPayload {
  backupDirectoryPath?: string;
  dataDirectoryPath?: string;
  oldSourceBuilds: 'ask' | 'delete' | 'keep';
  sourceVersion: string;
  skipBackup: boolean;
}

function isGitHubReleaseResponse(value: unknown): value is GitHubReleaseResponse {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidSourceVersionTag(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_VERSION_PATTERN.test(value.trim());
}

function normalizeUpdateString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`Desktop updater ${fieldName} must be a string.`);
  }
  return value.trim() || null;
}

function normalizeDesktopUpdateRunPayload(payload: DesktopUpdateRunPayload): NormalizedDesktopUpdateRunPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Desktop updater options must be an object.');
  }
  const oldSourceBuilds = payload.oldSourceBuilds ?? 'ask';
  if (oldSourceBuilds !== 'ask' && oldSourceBuilds !== 'delete' && oldSourceBuilds !== 'keep') {
    throw new Error('Desktop updater old source-build cleanup option is invalid.');
  }
  return {
    backupDirectoryPath: normalizeUpdateString(payload.backupDirectoryPath, 'backup directory') ?? undefined,
    dataDirectoryPath: normalizeUpdateString(payload.dataDirectoryPath, 'data directory') ?? undefined,
    oldSourceBuilds,
    skipBackup: payload.skipBackup === true,
    sourceVersion: normalizeSourceVersion(normalizeUpdateString(payload.sourceVersion, 'source version')),
  };
}

function parseReleaseLookupJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function releasePageUrlForTag(tag: string | null | undefined) {
  return tag ? `${RELEASES_PAGE_URL}/tag/${encodeURIComponent(tag)}` : `${RELEASES_PAGE_URL}/latest`;
}

function normalizedReleasePageUrl(value: unknown, tag: string | null | undefined) {
  const fallback = releasePageUrlForTag(tag);
  if (typeof value !== 'string') {
    return fallback;
  }
  try {
    const parsedUrl = new URL(value);
    const expectedUrl = new URL(fallback);
    return parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname === expectedUrl.hostname &&
      parsedUrl.pathname === expectedUrl.pathname &&
      parsedUrl.search === '' &&
      parsedUrl.hash === ''
      ? parsedUrl.toString()
      : fallback;
  } catch {
    return fallback;
  }
}

export async function checkForKaurKhorUpdate({
  appVersion,
  platform,
}: {
  appVersion: string;
  platform: NodeJS.Platform;
}): Promise<DesktopUpdateCheckResult> {
  const releases = await fetchReleaseVersions();
  const latestRelease = releases[0] ?? await fetchLatestRelease();
  const latestVersion = latestRelease.tag_name?.replace(/^v/, '') ?? null;
  const isUpdateAvailable = latestVersion ? compareVersions(latestVersion, appVersion) > 0 : false;
  const isPlatformSupported =
    platform === 'darwin' || platform === 'linux' || platform === 'win32';
  const availableVersions = buildUpdateVersionOptions(releases.length > 0 ? releases : [latestRelease]);

  return {
    availableVersions,
    currentVersion: appVersion,
    isPlatformSupported,
    isUpdateAvailable,
    latestVersion,
    releaseTag: latestRelease.tag_name ?? null,
    releaseUrl: normalizedReleasePageUrl(latestRelease.html_url, latestRelease.tag_name),
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
  const updatePayload = normalizeDesktopUpdateRunPayload(payload);
  const backupDirectoryPath = updatePayload.backupDirectoryPath ?? null;
  if (!backupDirectoryPath && !updatePayload.skipBackup) {
    throw new Error('Choose a snapshot export folder or skip backup before installing an update.');
  }

  const scriptPath = await writeUpdaterScript({
    appVersion,
    backupDirectoryPath,
    dataDirectoryPath: updatePayload.dataDirectoryPath ?? dataDirectoryPath,
    oldSourceBuilds: updatePayload.oldSourceBuilds,
    sourceVersion: updatePayload.sourceVersion,
    skipBackup: updatePayload.skipBackup === true,
  });

  await launchScriptInTerminal(scriptPath);
  app.quit();
  return {
    started: true,
    message: 'Kaur Khor will close while the updater builds and installs the latest release.',
  };
}

async function fetchLatestRelease(): Promise<GitHubReleaseResponse> {
  const body = await downloadText(RELEASE_API_URL);
  const parsed = parseReleaseLookupJson(body);
  return isGitHubReleaseResponse(parsed) && parsed.prerelease !== true && isValidSourceVersionTag(parsed.tag_name)
    ? parsed
    : {};
}

async function fetchReleaseVersions(): Promise<GitHubReleaseResponse[]> {
  const body = await downloadText(RELEASES_API_URL);
  const releases = parseReleaseLookupJson(body);
  if (!Array.isArray(releases)) {
    return [];
  }
  return releases.filter((release) =>
    isGitHubReleaseResponse(release) &&
    release.prerelease !== true &&
    isValidSourceVersionTag(release.tag_name),
  );
}

function buildUpdateVersionOptions(releases: GitHubReleaseResponse[]): DesktopUpdateVersionOption[] {
  const latestRelease = releases[0];
  const options: DesktopUpdateVersionOption[] = [];
  const releaseTags = new Set<string>();
  if (latestRelease?.tag_name) {
    releaseTags.add(latestRelease.tag_name);
    options.push({
      label: `Latest (${latestRelease.tag_name})`,
      releaseTag: latestRelease.tag_name,
      releaseUrl: normalizedReleasePageUrl(latestRelease.html_url, latestRelease.tag_name),
      value: 'latest',
      version: latestRelease.tag_name.replace(/^v/, ''),
    });
  }

  for (const release of releases) {
    if (!release.tag_name || releaseTags.has(release.tag_name)) {
      continue;
    }
    releaseTags.add(release.tag_name);
    options.push({
      label: release.tag_name,
      releaseTag: release.tag_name,
      releaseUrl: normalizedReleasePageUrl(release.html_url, release.tag_name),
      value: release.tag_name,
      version: release.tag_name.replace(/^v/, ''),
    });
  }

  return options;
}

function normalizeSourceVersion(sourceVersion: string | null | undefined) {
  const trimmed = sourceVersion?.trim();
  if (!trimmed || trimmed.length === 0 || trimmed === 'latest') {
    return 'latest';
  }
  if (!SOURCE_VERSION_PATTERN.test(trimmed)) {
    throw new Error('Choose a valid Kaur Khor release version before starting the updater.');
  }
  return trimmed;
}

export function sourceArchiveUrlForVersion(sourceVersion: string | null | undefined) {
  const normalized = normalizeSourceVersion(sourceVersion);
  if (normalized === 'latest') {
    return `${LATEST_RELEASE_DOWNLOAD_BASE_URL}/kaur-khor-latest-source-build.tar.gz`;
  }

  const tag = normalized.startsWith('v') ? normalized : `v${normalized}`;
  return `${RELEASE_DOWNLOAD_BASE_URL}/${encodeURIComponent(tag)}/${encodeURIComponent(`kaur-khor-${tag}-source-build.tar.gz`)}`;
}

function sourceArchiveNameForVersion(sourceVersion: string | null | undefined) {
  const normalized = normalizeSourceVersion(sourceVersion);
  if (normalized === 'latest') {
    return 'kaur-khor-latest-source-build.tar.gz';
  }

  const tag = normalized.startsWith('v') ? normalized : `v${normalized}`;
  return `kaur-khor-${tag}-source-build.tar.gz`;
}

function downloadText(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolveDownload, rejectDownload) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      rejectDownload(new Error('GitHub release lookup redirected to an unsupported protocol.'));
      return;
    }
    if (parsedUrl.hostname !== 'api.github.com') {
      rejectDownload(new Error('GitHub release lookup redirected to an untrusted host.'));
      return;
    }

    const req = httpsRequest(url, { headers: { 'User-Agent': 'kaur-khor-desktop-updater' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= MAX_RELEASE_LOOKUP_REDIRECTS) {
          rejectDownload(new Error('GitHub release lookup exceeded the redirect limit.'));
          return;
        }
        downloadText(new URL(response.headers.location, url).toString(), redirectCount + 1).then(resolveDownload, rejectDownload);
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
  oldSourceBuilds,
  sourceVersion,
  skipBackup,
}: {
  appVersion: string;
  backupDirectoryPath: string | null;
  dataDirectoryPath: string;
  oldSourceBuilds: 'ask' | 'delete' | 'keep';
  sourceVersion: string;
  skipBackup: boolean;
}) {
  const updateDirectory = join(tmpdir(), `kaur-khor-update-${Date.now()}`);
  await mkdir(updateDirectory, { recursive: true });
  const sourceArchiveUrl = sourceArchiveUrlForVersion(sourceVersion);
  const sourceArchiveChecksumUrl = `${sourceArchiveUrl}.sha256`;
  const sourceArchiveName = sourceArchiveNameForVersion(sourceVersion);

  if (process.platform === 'win32') {
    const scriptPath = join(updateDirectory, 'update-kaur-khor.ps1');
    await writeFile(scriptPath, windowsUpdateScript({
      backupDirectoryPath,
      dataDirectoryPath,
      oldSourceBuilds,
      skipBackup,
      sourceArchiveChecksumUrl,
      sourceArchiveName,
      sourceArchiveUrl,
      sourceVersion,
    }), 'utf8');
    return scriptPath;
  }

  const scriptPath = join(updateDirectory, 'update-kaur-khor.sh');
  await writeFile(scriptPath, shellUpdateScript({
    appVersion,
    backupDirectoryPath,
    dataDirectoryPath,
    oldSourceBuilds,
    skipBackup,
    sourceArchiveChecksumUrl,
    sourceArchiveName,
    sourceArchiveUrl,
    sourceVersion,
  }), {
    encoding: 'utf8',
    mode: 0o755,
  });
  return scriptPath;
}

function shellUpdateScript({
  appVersion,
  backupDirectoryPath,
  dataDirectoryPath,
  oldSourceBuilds,
  sourceArchiveName,
  sourceArchiveChecksumUrl,
  sourceArchiveUrl,
  sourceVersion,
  skipBackup,
}: {
  appVersion: string;
  backupDirectoryPath: string | null;
  dataDirectoryPath: string;
  oldSourceBuilds: 'ask' | 'delete' | 'keep';
  sourceArchiveName: string;
  sourceArchiveChecksumUrl: string;
  sourceArchiveUrl: string;
  sourceVersion: string;
  skipBackup: boolean;
}) {
  const backupArg = backupDirectoryPath ? ` --backup-dir=${shellQuote(backupDirectoryPath)}` : '';
  const oldSourceBuildsArg = oldSourceBuilds === 'delete'
    ? ' --delete-old-source-builds'
    : oldSourceBuilds === 'keep'
      ? ' --keep-old-source-builds'
      : '';
  const skipArg = skipBackup ? ' --skip-backup' : '';
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cd "$(pwd -P)"
echo "Updating Kaur Khor from v${appVersion} to ${sourceVersion}..."
curl -fL ${shellQuote(sourceArchiveUrl)} -o ${shellQuote(sourceArchiveName)}
curl -fL ${shellQuote(sourceArchiveChecksumUrl)} -o ${shellQuote(`${sourceArchiveName}.sha256`)}
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c ${shellQuote(`${sourceArchiveName}.sha256`)}
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c ${shellQuote(`${sourceArchiveName}.sha256`)}
else
  echo "Need shasum or sha256sum to verify the Kaur Khor source-build archive." >&2
  exit 1
fi
while IFS= read -r archive_entry; do
  case "$archive_entry" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\\\*) echo "Refusing to extract unsafe source-build archive path: $archive_entry" >&2; exit 1 ;;
  esac
  if [[ "$archive_entry" != */* || "$archive_entry" == ../* || "$archive_entry" == */../* || "$archive_entry" == */.. || "$archive_entry" == *//* ]]; then
    echo "Refusing to extract unsafe source-build archive path: $archive_entry" >&2
    exit 1
  fi
done < <(tar -tzf ${shellQuote(sourceArchiveName)})
tar -xzf ${shellQuote(sourceArchiveName)}
cd kaur-khor-*-source-build
./tools/scripts/build-from-source.sh --update --data-dir=${shellQuote(dataDirectoryPath)}${backupArg}${skipArg}${oldSourceBuildsArg}
echo "Update finished. Reopen Kaur Khor and restore the exported snapshot from your chosen backup folder if needed."
`;
}

function windowsUpdateScript({
  backupDirectoryPath,
  dataDirectoryPath,
  oldSourceBuilds,
  sourceArchiveName,
  sourceArchiveChecksumUrl,
  sourceArchiveUrl,
  sourceVersion,
  skipBackup,
}: {
  backupDirectoryPath: string | null;
  dataDirectoryPath: string;
  oldSourceBuilds: 'ask' | 'delete' | 'keep';
  sourceArchiveName: string;
  sourceArchiveChecksumUrl: string;
  sourceArchiveUrl: string;
  sourceVersion: string;
  skipBackup: boolean;
}) {
  const backupArg = backupDirectoryPath ? ` --backup-dir=${powerShellQuote(backupDirectoryPath)}` : '';
  const oldSourceBuildsArg = oldSourceBuilds === 'delete'
    ? ' --delete-old-source-builds'
    : oldSourceBuilds === 'keep'
      ? ' --keep-old-source-builds'
      : '';
  const skipArg = skipBackup ? ' --skip-backup' : '';
  return `$ErrorActionPreference = "Stop"
function Resolve-PhysicalPath {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  $CurrentPath = $Path
  $SeenPaths = @{}
  while ($true) {
    $Item = Get-Item -LiteralPath $CurrentPath -Force
    if ($Item.PSObject.Methods.Name -contains "ResolveLinkTarget") {
      $ResolvedItem = $Item.ResolveLinkTarget($true)
      if ($ResolvedItem) {
        return $ResolvedItem.FullName
      }
    }

    $TargetProperty = $Item.PSObject.Properties["Target"]
    if (-not $TargetProperty -or -not $TargetProperty.Value) {
      return $Item.FullName
    }

    $ItemPath = $Item.FullName.ToLowerInvariant()
    if ($SeenPaths.ContainsKey($ItemPath)) {
      throw "Refusing to resolve circular Kaur Khor update path: $Item.FullName"
    }
    $SeenPaths[$ItemPath] = $true

    $Target = @($TargetProperty.Value)[0]
    if (-not [System.IO.Path]::IsPathRooted($Target)) {
      $TargetBase = [System.IO.Path]::GetDirectoryName($Item.FullName)
      $Target = Join-Path $TargetBase $Target
    }
    $CurrentPath = $Target
  }
}
Set-Location (Resolve-PhysicalPath $PSScriptRoot)
Write-Host "Updating Kaur Khor to ${sourceVersion}..."
Invoke-WebRequest -Uri "${sourceArchiveUrl}" -OutFile "${sourceArchiveName}"
$expectedHash = (Invoke-WebRequest -Uri "${sourceArchiveChecksumUrl}").Content.Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0].ToLowerInvariant()
if ($expectedHash -notmatch "^[a-f0-9]{64}$") {
  throw "Invalid SHA-256 checksum for Kaur Khor source-build archive."
}
$actualHash = (Get-FileHash -Algorithm SHA256 -Path "${sourceArchiveName}").Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
  throw "SHA-256 mismatch for Kaur Khor source-build archive. Expected $expectedHash, got $actualHash."
}
$archiveEntries = tar -tf "${sourceArchiveName}"
foreach ($archiveEntry in $archiveEntries) {
  if ($archiveEntry -match '^(\\/|[A-Za-z]:[\\\\/])' -or $archiveEntry -notmatch '[\\\\/]' -or $archiveEntry -match '(^|[\\\\/])\\.\\.($|[\\\\/])' -or $archiveEntry -match '[\\\\/]{2,}') {
    throw "Refusing to extract unsafe source-build archive path: $archiveEntry"
  }
}
tar -xzf "${sourceArchiveName}"
Set-Location "kaur-khor-*-source-build"
.\\tools\\scripts\\build-from-source.ps1 --update --data-dir=${powerShellQuote(dataDirectoryPath)}${backupArg}${skipArg}${oldSourceBuildsArg}
Write-Host "Update finished. Reopen Kaur Khor and restore the exported snapshot from your chosen backup folder if needed."
`;
}

async function launchScriptInTerminal(scriptPath: string) {
  let child: ChildProcess;
  if (process.platform === 'darwin') {
    child = spawn('osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(scriptPath)}`], {
      detached: true,
      stdio: 'ignore',
    });
    await waitForTerminalSpawn(child);
    child.unref();
    return;
  }

  if (process.platform === 'win32') {
    child = spawn('powershell.exe', ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    await waitForTerminalSpawn(child);
    child.unref();
    return;
  }

  const terminal = process.env.TERM_PROGRAM || 'x-terminal-emulator';
  child = spawn(terminal, ['-e', scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  await waitForTerminalSpawn(child);
  child.unref();
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function powerShellQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function waitForTerminalSpawn(child: ChildProcess) {
  return new Promise<void>((resolveSpawn, rejectSpawn) => {
    const cleanup = () => {
      child.off('spawn', handleSpawn);
      child.off('error', handleError);
    };
    const handleSpawn = () => {
      cleanup();
      resolveSpawn();
    };
    const handleError = (error: Error) => {
      cleanup();
      rejectSpawn(error);
    };
    child.once('spawn', handleSpawn);
    child.once('error', handleError);
  });
}
