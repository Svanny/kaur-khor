#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { request as httpsRequest } from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  latestDownloadSnippetArchiveName,
  prepareSourceBuildUpdate,
  releaseVersionFromSourceRoot,
} from './update-support.mjs';

const PNPM_VERSION = '10.32.1';
const RUSTUP_VERSION = '1.28.2';
const MINIMUM_CARGO_VERSION = '1.85.0';
const DEFAULT_REPO = 'https://github.com/Svanny/kaur-khor.git';
const DEFAULT_REF = 'latest';
const SOURCE_BUILD_RELEASE_MARKER = '.kaur-khor-source-build-release';
const SUPPORTED_TARGETS = new Set(['mac-arm64', 'mac-x64', 'linux-arm64', 'linux-x64', 'windows-x64']);
const TARGET_ALIASES = {
  'darwin-arm64': 'mac-arm64',
  'darwin-x64': 'mac-x64',
  'linux-amd64': 'linux-x64',
  'linux-x86_64': 'linux-x64',
  'win-x64': 'windows-x64',
};
const RUSTUP_TARGETS = {
  'mac-arm64': 'aarch64-apple-darwin',
  'mac-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'windows-x64': 'x86_64-pc-windows-msvc',
};
const RUSTUP_SHA256_BY_TARGET = {
  'aarch64-apple-darwin': '20ef5516c31b1ac2290084199ba77dbbcaa1406c45c1d978ca68558ef5964ef5',
  'x86_64-apple-darwin': '9c331076f62b4d0edeae63d9d1c9442d5fe39b37b05025ec8d41c5ed35486496',
  'aarch64-unknown-linux-gnu': 'e3853c5a252fca15252d07cb23a1bdd9377a8c6f3efa01531109281ae47f841c',
  'x86_64-unknown-linux-gnu': '20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c',
  'x86_64-pc-windows-msvc': '88d8258dcf6ae4f7a80c7d1088e1f36fa7025a1cfd1343731b4ee6f385121fc0',
};

if (isDirectExecution()) {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  await main(options);
}

async function main(options) {
  const target = resolveTarget(options.platform);
  const packagePlan = packagePlanForTarget(target);

  if (options.resolveOnly) {
    console.log(`host=${process.platform}-${process.arch}`);
    console.log(`platform=${target.id}`);
    console.log(`package=${packagePlan.display}`);
    process.exit(0);
  }

  printWarning(target.id);

  const sourceRoot = await resolveSourceRoot();
  process.chdir(sourceRoot);

  if (options.update) {
    await prepareSourceBuildUpdate({
      backupDir: options.backupDir,
      dataDir: options.dataDir,
      nextVersion: releaseVersionFromSourceRoot(sourceRoot),
      noUninstall: options.noUninstall,
      skipBackup: options.skipBackup,
      target,
    });
    process.env.KAUR_KHOR_UPDATE_MODE = '1';
    if (options.noUninstall) {
      process.env.KAUR_KHOR_NO_UNINSTALL = '1';
    }
  }

  const linuxInstallEnv = prepareLinuxInstallPrivilege(target);
  ensurePlatformTools(target);
  const pnpm = ensurePnpm();
  const cargo = await ensureCargo(target);

  runPnpm(pnpm, ['install', '--frozen-lockfile'], sourceRoot, {
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
  });

  if (process.env.KAUR_KHOR_SKIP_RUST_TESTS === '1') {
    console.log('Skipping Rust desktop-core tests because KAUR_KHOR_SKIP_RUST_TESTS=1.');
  } else if (isProductionSourceBuild(sourceRoot)) {
    console.log('Skipping Rust desktop-core tests for the production source-build release.');
  } else {
    run(cargo, ['test', '--manifest-path', resolve(sourceRoot, 'apps/desktop-core/Cargo.toml')], {
      cwd: sourceRoot,
    });
  }

  runPnpm(pnpm, packagePlan.args, sourceRoot, {
    ...packagePlan.env,
    ...linuxInstallEnv,
  });
  if (target.os === 'mac') {
    openReleaseFolder(sourceRoot, target);
  }
  if (options.update) {
    await prunePreviousSourceBuilds(sourceRoot, options.oldSourceBuilds);
  }
}

function prepareLinuxInstallPrivilege(target) {
  if (target.os !== 'linux') {
    return {};
  }

  if (!findCommand('sudo') || !findCommand('apt-get')) {
    console.warn('sudo or apt-get was not found; the Linux package script will open release/ after packaging.');
    return { KAUR_KHOR_LINUX_INSTALL_PRECHECK: 'unavailable' };
  }

  console.log('Requesting sudo now so the generated .deb can be installed after packaging...');
  const result = spawnSync('sudo', ['-v'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.error || result.status !== 0) {
    console.warn('Could not verify sudo access; the Linux package script will open release/ after packaging.');
    return { KAUR_KHOR_LINUX_INSTALL_PRECHECK: 'failed' };
  }

  return { KAUR_KHOR_LINUX_INSTALL_PRECHECK: 'ready' };
}

function isDirectExecution() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function parseArgs(args) {
  const parsed = {
    backupDir: null,
    dataDir: null,
    help: false,
    noUninstall: false,
    oldSourceBuilds: 'ask',
    platform: null,
    resolveOnly: false,
    skipBackup: false,
    update: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--resolve-only') {
      parsed.resolveOnly = true;
      continue;
    }

    if (arg === '--update') {
      parsed.update = true;
      continue;
    }

    if (arg === '--skip-backup') {
      parsed.skipBackup = true;
      continue;
    }

    if (arg === '--no-uninstall') {
      parsed.noUninstall = true;
      continue;
    }

    if (arg === '--keep-old-source-builds') {
      parsed.oldSourceBuilds = 'keep';
      continue;
    }

    if (arg === '--delete-old-source-builds') {
      parsed.oldSourceBuilds = 'delete';
      continue;
    }

    if (arg.startsWith('--backup-dir=')) {
      parsed.backupDir = arg.slice('--backup-dir='.length);
      continue;
    }

    if (arg.startsWith('--data-dir=')) {
      parsed.dataDir = arg.slice('--data-dir='.length);
      continue;
    }

    if (arg.startsWith('--platform=')) {
      parsed.platform = arg.slice('--platform='.length);
      continue;
    }

    fail(`Unsupported argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Kaur Khor source build

Usage:
  node scripts/build-from-source.mjs [--platform=<target>] [--resolve-only] [--update]

Targets:
  mac-arm64
  mac-x64
  linux-arm64
  linux-x64
  windows-x64

The build is native-only. Omit --platform to autodetect this computer.

Environment:
  KAUR_KHOR_REPO             Source repository. Defaults to ${DEFAULT_REPO}.
  KAUR_KHOR_REF              Source ref. Defaults to ${DEFAULT_REF}.
  KAUR_KHOR_SOURCE_ARCHIVE_URL  Explicit source-build .tar.gz URL.
  KAUR_KHOR_BUILD_DIR        Directory used when the script must download source.
  KAUR_KHOR_DESKTOP_DATA_DIR Data directory to back up before --update installs.
  KAUR_KHOR_SKIP_RUST_TESTS  Set to 1 to skip desktop-core cargo tests.

Update flags:
  --update                  Export a pre-update snapshot and replace the installed app.
  --backup-dir=<path>       Write the pre-update snapshot export to this folder.
  --data-dir=<path>         Back up this Kaur Khor data directory.
  --skip-backup             Replace the app without exporting a pre-update snapshot.
  --no-uninstall            Skip explicit uninstall steps where supported.
  --keep-old-source-builds  Keep previous source-build folders without prompting.
  --delete-old-source-builds Delete previous source-build folders without prompting.
`);
}

function printWarning(targetId) {
  console.log(`Kaur Khor source-build warning

Do not run build commands from the internet unless you trust the source and understand what they do.
This script builds ${targetId}, installs project build dependencies when they are missing, and creates an unsigned local app/package.
Building locally avoids downloading a prebuilt app, but it does not magically make software safe.
`);
}

function resolveTarget(requestedPlatform) {
  const detected = detectHostTarget();
  const requested = normalizeTargetId(requestedPlatform ?? detected.id);

  if (!SUPPORTED_TARGETS.has(requested)) {
    fail(`Unsupported build platform: ${requested}. Supported platforms are: ${Array.from(SUPPORTED_TARGETS).join(', ')}.`);
  }

  if (requested !== detected.id) {
    fail(
      `Kaur Khor source builds are native-only. This host is ${process.platform}/${process.arch} (${detected.id}), so it cannot build ${requested}. Run the script on a ${requested} computer or omit --platform.`,
    );
  }

  return detected;
}

function normalizeTargetId(targetId) {
  return TARGET_ALIASES[targetId] ?? targetId;
}

function detectHostTarget() {
  const arch = process.arch;

  if (process.platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return { id: arch === 'arm64' ? 'mac-arm64' : 'mac-x64', os: 'mac', arch };
  }

  if (process.platform === 'linux' && (arch === 'arm64' || arch === 'x64')) {
    return { id: arch === 'arm64' ? 'linux-arm64' : 'linux-x64', os: 'linux', arch };
  }

  if (process.platform === 'win32' && arch === 'x64') {
    return { id: 'windows-x64', os: 'windows', arch };
  }

  fail(`Unsupported host platform: ${process.platform}/${arch}. Supported hosts are macOS arm64/x64, Linux arm64/x64, and Windows x64.`);
}

function packagePlanForTarget(target) {
  if (target.os === 'mac') {
    return {
      args: ['package:mac'],
      display: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:mac',
      env: { ALLOW_UNSIGNED_PACKAGING: '1' },
    };
  }

  if (target.os === 'linux') {
    return {
      args: ['package:linux'],
      display: 'pnpm package:linux',
      env: {},
    };
  }

  return {
    args: ['package:win:native'],
    display: '$env:ALLOW_UNSIGNED_PACKAGING="1"; pnpm package:win:native',
    env: { ALLOW_UNSIGNED_PACKAGING: '1' },
  };
}

async function resolveSourceRoot() {
  const currentRoot = findCurrentSourceRoot(process.cwd());
  if (currentRoot) {
    return organizeSourceBuildRoot(currentRoot);
  }

  const buildDir = resolve(process.env.KAUR_KHOR_BUILD_DIR || join(tmpdir(), 'kaur-khor-source-build'));
  const repo = process.env.KAUR_KHOR_REPO || DEFAULT_REPO;
  const ref = process.env.KAUR_KHOR_REF || DEFAULT_REF;
  const explicitArchiveUrl = process.env.KAUR_KHOR_SOURCE_ARCHIVE_URL || null;
  const releaseArchiveUrl = explicitArchiveUrl ? null : githubReleaseSourceArchiveUrl(repo, ref);
  const fallbackArchiveUrl = githubArchiveUrl(repo, ref);
  const archiveUrl = explicitArchiveUrl ?? releaseArchiveUrl ?? fallbackArchiveUrl;

  console.log(`Downloading Kaur Khor source from ${archiveUrl}`);
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  const archive = await downloadSourceArchive({
    archiveUrl,
    fallbackArchiveUrl: releaseArchiveUrl ? fallbackArchiveUrl : null,
    checksumUrl: releaseArchiveUrl ? `${releaseArchiveUrl}.sha256` : null,
  });
  extractTarGz(archive, buildDir);

  const entries = readDirectoryNames(buildDir);
  if (entries.length !== 1) {
    fail(`Expected one source directory inside ${buildDir}, found ${entries.length}.`);
  }

  return organizeSourceBuildRoot(resolve(buildDir, entries[0]));
}

function isProductionSourceBuild(sourceRoot) {
  return existsSync(resolve(sourceRoot, SOURCE_BUILD_RELEASE_MARKER));
}

export function organizeSourceBuildRoot(sourceRoot) {
  const resolvedSourceRoot = resolve(sourceRoot);
  if (!isProductionSourceBuild(resolvedSourceRoot)) {
    return resolvedSourceRoot;
  }

  const sourceParent = dirname(resolvedSourceRoot);
  if (basename(sourceParent) === 'kaur-khor') {
    return resolvedSourceRoot;
  }

  const sourceBuildParent = resolve(sourceParent, 'kaur-khor');
  mkdirSync(sourceBuildParent, { recursive: true });
  const targetRoot = uniqueSourceBuildRoot(sourceBuildParent, basename(resolvedSourceRoot));
  const originalCwd = process.cwd();
  process.chdir(sourceParent);
  renameSourceBuildRoot(resolvedSourceRoot, targetRoot);
  process.chdir(isSameOrChildPath(originalCwd, resolvedSourceRoot) ? targetRoot : originalCwd);
  console.log(`Moved source-build folder into ${targetRoot}.`);
  return targetRoot;
}

function isSameOrChildPath(candidatePath, parentPath) {
  const relativePath = relative(parentPath, candidatePath);
  return relativePath === '' || (relativePath.length > 0 && !relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function uniqueSourceBuildRoot(parent, name) {
  let candidate = resolve(parent, name);
  let suffix = 2;

  while (existsSync(candidate)) {
    candidate = resolve(parent, `${name}-${suffix}`);
    suffix += 1;
  }

  return candidate;
}

function renameSourceBuildRoot(from, to) {
  try {
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
  } catch (error) {
    fail(`Could not move source-build folder into ${to}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function previousSourceBuildRoots(sourceRoot) {
  const resolvedSourceRoot = resolve(sourceRoot);
  const parent = dirname(resolvedSourceRoot);
  if (basename(parent) !== 'kaur-khor' || !existsSync(parent)) {
    return [];
  }

  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(parent, entry.name))
    .filter((entryPath) =>
      entryPath !== resolvedSourceRoot &&
      /^kaur-khor-v.+-source-build(?:-\d+)?$/.test(basename(entryPath)) &&
      existsSync(resolve(entryPath, SOURCE_BUILD_RELEASE_MARKER)),
    )
    .sort();
}

export async function prunePreviousSourceBuilds(sourceRoot, mode = 'ask') {
  const previousRoots = previousSourceBuildRoots(sourceRoot);
  if (previousRoots.length === 0 || mode === 'keep') {
    return [];
  }

  let shouldDelete = mode === 'delete';
  if (mode === 'ask') {
    shouldDelete = await askDeletePreviousSourceBuilds(previousRoots);
  }

  if (!shouldDelete) {
    console.log('Keeping previous source-build folders.');
    return [];
  }

  for (const previousRoot of previousRoots) {
    rmSync(previousRoot, { recursive: true, force: true });
  }
  console.log(`Deleted ${previousRoots.length} previous source-build folder${previousRoots.length === 1 ? '' : 's'}.`);
  return previousRoots;
}

async function askDeletePreviousSourceBuilds(previousRoots) {
  const readline = createInterface({ input, output });
  try {
    console.log('Previous Kaur Khor source-build folders were found:');
    for (const previousRoot of previousRoots) {
      console.log(`- ${previousRoot}`);
    }
    const answer = await readline.question('Delete previous source-build folders? Type DELETE to delete, or press Enter to keep: ');
    return /^delete$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

function findCurrentSourceRoot(start) {
  let current = resolve(start);

  while (true) {
    const packageJsonPath = resolve(current, 'package.json');
    const scriptPath = resolve(current, 'scripts/build-from-source.mjs');

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.name === 'kaur-khor' && existsSync(scriptPath)) {
          return current;
        }
      } catch {
        return null;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function githubArchiveUrl(repo, ref) {
  const match = repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/);
  if (!match) {
    fail(`KAUR_KHOR_REPO must be a GitHub HTTPS repository URL when source download is needed. Received: ${repo}`);
  }

  const [, owner, name] = match;
  if (ref === 'latest') {
    return `https://codeload.github.com/${owner}/${name}/tar.gz/main`;
  }
  const encodedRef = ref.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://codeload.github.com/${owner}/${name}/tar.gz/${encodedRef}`;
}

function githubReleaseSourceArchiveUrl(repo, ref) {
  if (ref !== 'latest' && !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(ref)) {
    return null;
  }

  const match = repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/);
  if (!match) {
    return null;
  }

  const [, owner, name] = match;
  const assetName = ref === 'latest' ? latestDownloadSnippetArchiveName() : `${name}-${ref}-source-build.tar.gz`;
  return `https://github.com/${owner}/${name}/releases/download/${encodeURIComponent(ref)}/${encodeURIComponent(assetName)}`;
}

async function downloadSourceArchive({ archiveUrl, fallbackArchiveUrl, checksumUrl }) {
  try {
    const archive = await downloadOrThrow(archiveUrl);
    if (checksumUrl) {
      await verifyRemoteSha256(archive, checksumUrl);
    }
    return archive;
  } catch (error) {
    if (!fallbackArchiveUrl) {
      fail(error instanceof Error ? error.message : String(error));
    }
    console.warn(`Could not download production source-build archive: ${error instanceof Error ? error.message : String(error)}`);
    console.warn(`Falling back to GitHub autogenerated source archive: ${fallbackArchiveUrl}`);
    return await download(fallbackArchiveUrl);
  }
}

async function verifyRemoteSha256(archive, checksumUrl) {
  try {
    const checksumText = (await downloadOrThrow(checksumUrl)).toString('utf8').trim();
    const expected = checksumText.split(/\s+/)[0]?.toLowerCase();
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error(`Invalid SHA-256 checksum format from ${checksumUrl}`);
    }
    verifySha256Buffer(archive, expected, checksumUrl);
  } catch (error) {
    throw new Error(`Could not verify source-build archive checksum: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function download(url) {
  return downloadOrThrow(url).catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}

async function downloadOrThrow(url) {
  return new Promise((resolveDownload, rejectDownload) => {
    const request = httpsRequest(url, { headers: { 'User-Agent': 'kaur-khor-source-build' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadOrThrow(new URL(response.headers.location, url).toString()).then(resolveDownload, rejectDownload);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        rejectDownload(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveDownload(Buffer.concat(chunks)));
    });

    request.on('error', rejectDownload);
    request.end();
  });
}

function extractTarGz(archive, destination) {
  const tar = gunzipSync(archive);
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;

    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = readTarString(header, 124, 12).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const type = String.fromCharCode(header[156] || 0);
    const data = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (type === 'x' || type === 'g') {
      continue;
    }

    const safePath = safeExtractPath(destination, fullName);
    if (type === '5') {
      mkdirSync(safePath, { recursive: true });
      continue;
    }

    if (type === '0' || type === '\0' || type === '') {
      mkdirSync(dirname(safePath), { recursive: true });
      writeFileSync(safePath, data);
      const modeText = readTarString(header, 100, 8).trim();
      const mode = Number.parseInt(modeText || '644', 8);
      if ((mode & 0o111) !== 0) {
        chmodSync(safePath, mode);
      }
    }
  }
}

function readTarString(buffer, start, length) {
  const raw = buffer.subarray(start, start + length);
  const nullIndex = raw.indexOf(0);
  return raw.subarray(0, nullIndex === -1 ? raw.length : nullIndex).toString('utf8');
}

function safeExtractPath(destination, archivePath) {
  const parts = archivePath.split('/').filter(Boolean).slice(1);
  if (parts.length === 0) {
    return destination;
  }

  const resolved = resolve(destination, ...parts);
  if (resolved !== destination && !resolved.startsWith(destination + sep)) {
    fail(`Refusing to extract unsafe archive path: ${archivePath}`);
  }
  return resolved;
}

function readDirectoryNames(directory) {
  return readdirSync(directory).filter((entry) => statSync(resolve(directory, entry)).isDirectory());
}

function ensurePlatformTools(target) {
  if (target.os === 'mac') {
    const xcodeSelect = findCommand('xcode-select');
    if (!xcodeSelect) {
      fail('macOS Command Line Tools are required, but xcode-select was not found.');
    }

    const check = spawnSync(xcodeSelect, ['-p'], { stdio: 'ignore' });
    if (check.status !== 0) {
      console.log('macOS Command Line Tools are missing. Starting the Apple installer...');
      run(xcodeSelect, ['--install']);
      fail('Complete the macOS Command Line Tools installer, then run this script again.');
    }
  }

  if (target.os === 'linux') {
    installLinuxBuildToolsIfPossible();
  }
}

function installLinuxBuildToolsIfPossible() {
  if (findCommand('cc') || findCommand('gcc') || findCommand('clang')) {
    return;
  }

  const sudo = findCommand('sudo');
  if (!sudo) {
    console.log('A C compiler was not found. Install your distribution build tools, then run this script again.');
    return;
  }

  if (findCommand('apt-get')) {
    run(sudo, ['apt-get', 'update']);
    run(sudo, ['apt-get', 'install', '-y', 'build-essential', 'pkg-config']);
    return;
  }

  if (findCommand('dnf')) {
    run(sudo, ['dnf', 'install', '-y', 'gcc', 'gcc-c++', 'make', 'pkgconf-pkg-config']);
    return;
  }

  if (findCommand('pacman')) {
    run(sudo, ['pacman', '-S', '--needed', '--noconfirm', 'base-devel', 'pkgconf']);
    return;
  }

  if (findCommand('zypper')) {
    run(sudo, ['zypper', '--non-interactive', 'install', '-t', 'pattern', 'devel_basis']);
  }
}

function ensurePnpm() {
  const pnpm = findCommand('pnpm');
  if (pnpm) {
    return { command: pnpm, prefix: [] };
  }

  const corepack = findCommand('corepack');
  if (corepack) {
    run(corepack, ['enable']);
    run(corepack, ['prepare', `pnpm@${PNPM_VERSION}`, '--activate']);
    const preparedPnpm = findCommand('pnpm');
    if (preparedPnpm) {
      return { command: preparedPnpm, prefix: [] };
    }
    return { command: corepack, prefix: ['pnpm'] };
  }

  const npm = findCommand('npm');
  if (npm) {
    return { command: npm, prefix: ['exec', '--yes', `pnpm@${PNPM_VERSION}`, '--'] };
  }

  fail('Could not bootstrap pnpm because pnpm, Corepack, and npm are all missing from PATH.');
}

export async function ensureCargo(target) {
  const cargo = findCommand('cargo');
  if (cargo && cargoMeetsMinimumVersion(cargo, MINIMUM_CARGO_VERSION)) {
    return cargo;
  }

  if (cargo) {
    console.log(`Cargo ${readCargoVersion(cargo) ?? 'from PATH'} is older than ${MINIMUM_CARGO_VERSION}; updating Rust stable with rustup...`);
    const rustup = findCommand('rustup');
    if (rustup) {
      run(rustup, ['toolchain', 'install', 'stable'], { allowFailure: true });
      run(rustup, ['default', 'stable'], { allowFailure: true });
      prependCargoHomeBinToPath();
      const cargoAfterUpdate = findCommand('cargo', [join(homedir(), '.cargo', 'bin')]);
      if (cargoAfterUpdate && cargoMeetsMinimumVersion(cargoAfterUpdate, MINIMUM_CARGO_VERSION)) {
        return cargoAfterUpdate;
      }
      fail(`Rust stable update finished, but Cargo is still older than ${MINIMUM_CARGO_VERSION}.`);
    }
  }

  await installRustup(target);
  const cargoAfterInstall = findCommand('cargo', [join(homedir(), '.cargo', 'bin')]);
  if (!cargoAfterInstall) {
    fail('Rust installation finished, but cargo was still not found.');
  }
  if (!cargoMeetsMinimumVersion(cargoAfterInstall, MINIMUM_CARGO_VERSION)) {
    fail(`Rust installation finished, but Cargo is still older than ${MINIMUM_CARGO_VERSION}.`);
  }
  return cargoAfterInstall;
}

function readCargoVersion(cargo) {
  const result = spawnSync(cargo, ['--version'], {
    encoding: 'utf8',
    shell: false,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  const match = /\bcargo\s+(\d+\.\d+\.\d+)\b/i.exec(result.stdout);
  return match?.[1] ?? null;
}

function cargoMeetsMinimumVersion(cargo, minimumVersion) {
  const version = readCargoVersion(cargo);
  return Boolean(version && compareVersions(version, minimumVersion) >= 0);
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }
  return 0;
}

function installRustup(target) {
  const rustupTarget = RUSTUP_TARGETS[target.id];
  const executableName = target.os === 'windows' ? 'rustup-init.exe' : 'rustup-init';
  const rustupUrl = `https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/${rustupTarget}/${executableName}`;
  const expectedSha256 = RUSTUP_SHA256_BY_TARGET[rustupTarget];
  if (!expectedSha256) {
    fail(`No pinned SHA-256 digest for rustup-init ${rustupTarget}. Refusing automatic Rust bootstrap.`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'kaur-khor-rustup-'));
  const rustupPath = join(tempDir, executableName);

  console.log(`Installing Rust toolchain with rustup for ${rustupTarget}...`);
  return download(rustupUrl).then((binary) => {
    try {
      verifySha256Buffer(binary, expectedSha256, `rustup-init ${rustupTarget}`);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    writeFileSync(rustupPath, binary);
    if (target.os !== 'windows') {
      chmodSync(rustupPath, 0o755);
    }
    run(rustupPath, ['-y', '--profile', 'minimal', '--default-toolchain', 'stable']);
    prependCargoHomeBinToPath();
  });
}

function prependCargoHomeBinToPath() {
  const cargoHomeBin = join(homedir(), '.cargo', 'bin');
  const delimiter = process.platform === 'win32' ? ';' : ':';
  process.env.PATH = `${cargoHomeBin}${delimiter}${process.env.PATH || ''}`;
}

export function verifySha256Buffer(buffer, expected, label) {
  const actual = createHash('sha256').update(buffer).digest('hex');
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${label}. Expected ${expected}, got ${actual}. Refusing to execute it.`);
  }
}

function runPnpm(pnpm, args, cwd, extraEnv = {}) {
  run(pnpm.command, [...pnpm.prefix, ...args], {
    cwd,
    env: extraEnv,
  });
}

function openReleaseFolder(sourceRoot, target) {
  const releaseDir = resolve(sourceRoot, 'release');
  const runnableDir = resolveRunnableAppFolder(releaseDir, target);
  console.log(`Build artifacts are in ${releaseDir}.`);
  console.log(`Runnable app folder is ${runnableDir}.`);

  if (process.platform === 'darwin' && findCommand('open')) {
    run('open', [runnableDir], { cwd: sourceRoot, allowFailure: true });
  } else if (process.platform === 'win32') {
    run('explorer.exe', [runnableDir], { cwd: sourceRoot, allowFailure: true });
  } else if (findCommand('xdg-open')) {
    run('xdg-open', [runnableDir], { cwd: sourceRoot, allowFailure: true });
  }
}

function resolveRunnableAppFolder(releaseDir, target) {
  const candidates = target.os === 'mac'
    ? [target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'mac']
    : target.os === 'windows'
      ? ['win-unpacked']
      : ['linux-unpacked'];

  for (const candidate of candidates) {
    const candidatePath = resolve(releaseDir, candidate);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return releaseDir;
}

function findCommand(command, extraDirs = []) {
  const pathEntries = [...extraDirs, ...(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')].filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];

  for (const pathEntry of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(pathEntry, process.platform === 'win32' ? command + extension.toLowerCase() : command);
      if (isExecutable(candidate)) {
        return candidate;
      }

      const rawCandidate = join(pathEntry, command);
      if (isExecutable(rawCandidate)) {
        return rawCandidate;
      }
    }
  }

  return null;
}

function isExecutable(path) {
  try {
    const stats = statSync(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  const shouldUseCommandShell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
  const result = shouldUseCommandShell ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine(command, args)], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  }) : spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    if (options.allowFailure) {
      return;
    }
    fail(result.error.message);
  }

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }
}

function commandLine(command, args) {
  return [command, ...args].map((part) => `"${String(part).replaceAll('"', '""')}"`).join(' ');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
