#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const hasWindowsSigningConfig =
  Boolean(process.env.WIN_CSC_LINK || process.env.CSC_LINK) &&
  Boolean(process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD);

if (process.env.ALLOW_UNSIGNED_PACKAGING !== '1' && !hasWindowsSigningConfig) {
  console.error(
    'Refusing unsigned Windows packaging. Set WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD (or CSC_LINK/CSC_KEY_PASSWORD) for a signed build, or ALLOW_UNSIGNED_PACKAGING=1 for a local-only unsigned build.',
  );
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.error('Native Windows packaging must run on Windows.');
  process.exit(1);
}

process.env.KAUR_KHOR_ARTIFACT_ARCH = 'x64';

run([process.execPath, resolve(root, 'scripts/stage-desktop-core.mjs'), '--platform=win32', '--arch=x64']);
run([pnpmCommand, 'build']);
run([pnpmCommand, 'exec', 'electron-builder', 'install-app-deps', '--platform=win32', '--arch=x64']);
run([pnpmCommand, 'exec', 'electron-builder', '--win', 'nsis', '--x64', '--config', 'electron-builder.yml', '--publish', 'never']);

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
