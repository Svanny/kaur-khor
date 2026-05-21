#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const options = parseArgs(process.argv.slice(2));

if (options.platform && process.platform !== options.platform) {
  fail(`desktop-core staging must run on ${options.platform}, but current platform is ${process.platform}`);
}

if (options.arch && process.arch !== options.arch) {
  fail(`desktop-core staging expected architecture ${options.arch}, but current architecture is ${process.arch}`);
}

const binaryName = process.platform === 'win32' ? 'kaur-khor-desktop-core.exe' : 'kaur-khor-desktop-core';
const cargoTargetDir = resolve(root, 'build', 'cargo-target', `${process.platform}-${process.arch}`);
const stageDir = resolve(root, 'build', 'release-resources', 'bin');

run(
  'cargo',
  ['build', '--manifest-path', resolve(root, 'apps/desktop-core/Cargo.toml'), '--release', '--locked'],
  {
    env: {
      CARGO_TARGET_DIR: cargoTargetDir,
    },
  },
);

const builtBinary = resolve(cargoTargetDir, 'release', binaryName);
if (!existsSync(builtBinary)) {
  fail(`desktop-core binary was not produced at ${builtBinary}`);
}

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

const stagedBinary = resolve(stageDir, binaryName);
copyFileSync(builtBinary, stagedBinary);

if (process.platform !== 'win32') {
  chmodSync(stagedBinary, 0o755);
}

console.log(`Staged ${binaryName} to ${stagedBinary}`);

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      fail(`unsupported argument: ${arg}`);
    }

    const [key, value] = arg.slice(2).split('=');
    if (!key || !value) {
      fail(`expected --key=value argument, received ${arg}`);
    }

    parsed[key] = value;
  }
  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
