#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCargo } from './build-from-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(resolve(root, 'package.json'));
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const hasWindowsSigningConfig =
  Boolean(process.env.WIN_CSC_LINK || process.env.CSC_LINK) &&
  Boolean(process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD);
const isUnsignedLocalPackage = process.env.ALLOW_UNSIGNED_PACKAGING === '1' && !hasWindowsSigningConfig;

if (!isUnsignedLocalPackage && !hasWindowsSigningConfig) {
  console.error(
    'Refusing unsigned Windows packaging. Set WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD (or CSC_LINK/CSC_KEY_PASSWORD) for a signed build, or run `$env:ALLOW_UNSIGNED_PACKAGING="1"; pnpm package:win:native` in PowerShell for a local-only unsigned build.',
  );
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.error('Native Windows packaging must run on Windows.');
  process.exit(1);
}

process.env.KAUR_KHOR_ARTIFACT_ARCH = 'x64';
const electronBuilderConfig = isUnsignedLocalPackage ? 'electron-builder.unsigned-win.yml' : 'electron-builder.yml';
if (isUnsignedLocalPackage) {
  process.env.ELECTRON_BUILDER_DISABLE_BUILD_CACHE = 'true';
}

ensureProjectDependencies();
await ensureCargo({ id: 'windows-x64', os: 'windows', arch: 'x64' });
run([process.execPath, resolve(root, 'scripts/stage-desktop-core.mjs'), '--platform=win32', '--arch=x64']);
run([pnpmCommand, 'build']);
run([pnpmCommand, 'exec', 'electron-builder', 'install-app-deps', '--platform=win32', '--arch=x64']);
run([
  pnpmCommand,
  'exec',
  'electron-builder',
  '--win',
  'nsis',
  '--x64',
  '--config',
  electronBuilderConfig,
  '--publish',
  'never',
]);
openInstaller();

function run(commandParts) {
  const [command, ...args] = commandParts;
  const shouldUseCommandShell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  const result = shouldUseCommandShell
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `${command} ${args.join(' ')}`], {
        cwd: root,
        stdio: 'inherit',
      })
    : spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
      });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function openInstaller() {
  const releaseDir = resolve(root, 'release');
  console.log(`Build artifacts are in ${releaseDir}.`);
  const installerPath = findWindowsInstaller(releaseDir);
  if (!installerPath) {
    console.warn(`Could not find Windows setup installer in ${releaseDir}; opening release folder instead.`);
    openReleaseFolder(releaseDir);
    return;
  }

  console.log(`Opening installer ${installerPath}.`);
  const installer = spawnSync(installerPath, [], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
  });

  if (installer.error) {
    console.error(`Could not open Windows installer: ${installer.error.message}`);
    process.exit(1);
  }

  if (installer.status !== 0) {
    process.exit(installer.status ?? 1);
  }

  console.log('Windows setup finished. You can now close this terminal window.');
}

function openReleaseFolder(releaseDir) {
  const child = spawn('explorer.exe', [releaseDir], {
    detached: true,
    cwd: root,
    stdio: 'ignore',
  });

  child.once('error', (error) => {
    console.error(`Could not open release folder: ${error.message}`);
  });
  child.unref();
}

function findWindowsInstaller(releaseDir) {
  const candidates = readdirSync(releaseDir)
    .filter((entry) => /^kaur-khor-v.+-win-x64\.exe$/.test(entry))
    .map((entry) => {
      const path = resolve(releaseDir, entry);
      return { path, modifiedAt: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  return candidates[0]?.path ?? null;
}

function ensureProjectDependencies() {
  if (hasResolvablePackage('rcedit')) {
    return;
  }

  console.warn('Project dependencies are missing or stale; running pnpm install --frozen-lockfile...');
  run([pnpmCommand, 'install', '--frozen-lockfile']);
}

function hasResolvablePackage(packageName) {
  try {
    requireFromRoot.resolve(packageName);
    return true;
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return false;
    }

    throw error;
  }
}
