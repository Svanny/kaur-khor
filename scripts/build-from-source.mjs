#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

const PNPM_VERSION = '10.32.1';
const DEFAULT_REPO = 'https://github.com/Svanny/kaur-khor.git';
const DEFAULT_REF = 'main';
const SUPPORTED_TARGETS = new Set(['mac-arm64', 'mac-x64', 'linux-arm64', 'linux-x64', 'windows-x64']);
const RUSTUP_TARGETS = {
  'mac-arm64': 'aarch64-apple-darwin',
  'mac-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'windows-x64': 'x86_64-pc-windows-msvc',
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

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

ensurePlatformTools(target);
const pnpm = ensurePnpm();
const cargo = await ensureCargo(target);

runPnpm(pnpm, ['install', '--frozen-lockfile'], sourceRoot);

if (process.env.KAUR_KHOR_SKIP_RUST_TESTS === '1') {
  console.log('Skipping Rust desktop-core tests because KAUR_KHOR_SKIP_RUST_TESTS=1.');
} else {
  run(cargo, ['test', '--manifest-path', resolve(sourceRoot, 'apps/desktop-core/Cargo.toml')], {
    cwd: sourceRoot,
  });
}

runPnpm(pnpm, packagePlan.args, sourceRoot, packagePlan.env);
openReleaseFolder(sourceRoot);

function parseArgs(args) {
  const parsed = {
    help: false,
    platform: null,
    resolveOnly: false,
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
  node scripts/build-from-source.mjs [--platform=<target>] [--resolve-only]

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
  KAUR_KHOR_BUILD_DIR        Directory used when the script must download source.
  KAUR_KHOR_SKIP_RUST_TESTS  Set to 1 to skip desktop-core cargo tests.
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
  const requested = requestedPlatform ?? detected.id;

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
    display: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:win:native',
    env: { ALLOW_UNSIGNED_PACKAGING: '1' },
  };
}

async function resolveSourceRoot() {
  const currentRoot = findCurrentSourceRoot(process.cwd());
  if (currentRoot) {
    return currentRoot;
  }

  const buildDir = resolve(process.env.KAUR_KHOR_BUILD_DIR || join(tmpdir(), 'kaur-khor-source-build'));
  const repo = process.env.KAUR_KHOR_REPO || DEFAULT_REPO;
  const ref = process.env.KAUR_KHOR_REF || DEFAULT_REF;
  const archiveUrl = githubArchiveUrl(repo, ref);

  console.log(`Downloading Kaur Khor source from ${archiveUrl}`);
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  const archive = await download(archiveUrl);
  extractTarGz(archive, buildDir);

  const entries = readDirectoryNames(buildDir);
  if (entries.length !== 1) {
    fail(`Expected one source directory inside ${buildDir}, found ${entries.length}.`);
  }

  return resolve(buildDir, entries[0]);
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
  const encodedRef = ref.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://codeload.github.com/${owner}/${name}/tar.gz/${encodedRef}`;
}

async function download(url) {
  return new Promise((resolveDownload, rejectDownload) => {
    const request = httpsRequest(url, { headers: { 'User-Agent': 'kaur-khor-source-build' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString()).then(resolveDownload, rejectDownload);
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
  }).catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
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

async function ensureCargo(target) {
  const cargo = findCommand('cargo');
  if (cargo) {
    return cargo;
  }

  await installRustup(target);
  const cargoAfterInstall = findCommand('cargo', [join(homedir(), '.cargo', 'bin')]);
  if (!cargoAfterInstall) {
    fail('Rust installation finished, but cargo was still not found.');
  }
  return cargoAfterInstall;
}

function installRustup(target) {
  const rustupTarget = RUSTUP_TARGETS[target.id];
  const executableName = target.os === 'windows' ? 'rustup-init.exe' : 'rustup-init';
  const rustupUrl = `https://static.rust-lang.org/rustup/dist/${rustupTarget}/${executableName}`;
  const tempDir = mkdtempSync(join(tmpdir(), 'kaur-khor-rustup-'));
  const rustupPath = join(tempDir, executableName);

  console.log(`Installing Rust toolchain with rustup for ${rustupTarget}...`);
  return download(rustupUrl).then((binary) => {
    writeFileSync(rustupPath, binary);
    if (target.os !== 'windows') {
      chmodSync(rustupPath, 0o755);
    }
    run(rustupPath, ['-y', '--profile', 'minimal', '--default-toolchain', 'stable']);
    process.env.PATH = `${join(homedir(), '.cargo', 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`;
  });
}

function runPnpm(pnpm, args, cwd, extraEnv = {}) {
  run(pnpm.command, [...pnpm.prefix, ...args], {
    cwd,
    env: extraEnv,
  });
}

function openReleaseFolder(sourceRoot) {
  const releaseDir = resolve(sourceRoot, 'release');
  console.log(`Build artifacts are in ${releaseDir}.`);

  if (process.platform === 'darwin' && findCommand('open')) {
    run('open', [releaseDir], { cwd: sourceRoot, allowFailure: true });
  } else if (process.platform === 'win32') {
    run('explorer.exe', [releaseDir], { cwd: sourceRoot, allowFailure: true });
  } else if (findCommand('xdg-open')) {
    run('xdg-open', [releaseDir], { cwd: sourceRoot, allowFailure: true });
  }
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
