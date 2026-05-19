#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const rawArgs = process.argv.slice(2);
const targetArg = rawArgs.find((arg) => arg.startsWith('--target='));
const target = targetArg?.slice('--target='.length) || 'all';
const serialFlags = new Set(['--serial', '--workers=1']);
const shouldRunSerial =
  process.env.KAUR_KHOR_UI_MATRIX_SERIAL === '1' || rawArgs.some((arg) => serialFlags.has(arg));
const forwardedArgs = rawArgs.filter((arg) => (
  arg !== '--' && !arg.startsWith('--target=') && !serialFlags.has(arg)
));

const targetFiles = {
  desktop: [
    'ui-matrix/scenarios/desktop-fresh.spec.ts',
    'ui-matrix/scenarios/desktop-generated.spec.ts',
    'ui-matrix/scenarios/desktop-dependent.spec.ts',
  ],
  web: ['ui-matrix/scenarios/web.spec.ts'],
  mobile: ['ui-matrix/scenarios/mobile.spec.ts'],
};

function selectedFiles(nextTarget) {
  if (nextTarget === 'all') {
    return [...targetFiles.desktop, ...targetFiles.web, ...targetFiles.mobile];
  }
  if (nextTarget in targetFiles) {
    return targetFiles[nextTarget];
  }
  console.error(`[ui-matrix] unknown target "${nextTarget}". Use all, desktop, web, or mobile.`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.once('exit', (code) => resolveRun(code ?? 1));
  });
}

const files = selectedFiles(target);
const needsDesktopBuild = target === 'all' || target === 'desktop';
const needsWebServer = true;

if (needsDesktopBuild) {
  const buildCode = await run('pnpm', ['build']);
  if (buildCode !== 0) {
    process.exit(buildCode);
  }

  const coreBuildCode = await run('cargo', ['build', '--manifest-path', resolve('apps/desktop-core/Cargo.toml')]);
  if (coreBuildCode !== 0) {
    process.exit(coreBuildCode);
  }
}

const desktopCoreBinary = resolve(
  'apps/desktop-core/target/debug',
  process.platform === 'win32' ? 'kaur-khor-desktop-core.exe' : 'kaur-khor-desktop-core',
);

const env = {
  ...process.env,
  KAUR_KHOR_UI_MATRIX_WEB: needsWebServer ? '1' : '0',
  KAUR_KHOR_UI_MATRIX_WORKERS: shouldRunSerial ? '1' : (process.env.KAUR_KHOR_UI_MATRIX_WORKERS ?? '3'),
};

if (process.env.KAUR_KHOR_DESKTOP_CORE_BINARY) {
  env.KAUR_KHOR_DESKTOP_CORE_BINARY = process.env.KAUR_KHOR_DESKTOP_CORE_BINARY;
}

if (env.NO_COLOR) {
  delete env.NO_COLOR;
}

const testCode = await run(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.ui-matrix.config.ts', ...files, ...forwardedArgs],
  { env },
);

process.exit(testCode);
