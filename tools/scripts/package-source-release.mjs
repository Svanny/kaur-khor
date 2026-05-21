#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sourceBuildArchiveNames } from './update-support.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'dist');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const releaseVersion = resolveReleaseVersion();
const releaseTag = releaseVersion.startsWith('v') ? releaseVersion : `v${releaseVersion}`;
const archiveNames = sourceBuildArchiveNames(releaseVersion);
const archiveBaseName = archiveNames.versionedBaseName;
const archivePath = resolve(outputDir, `${archiveBaseName}.tar.gz`);
const checksumPath = `${archivePath}.sha256`;
const latestArchiveBaseName = archiveNames.latestBaseName;
const latestArchivePath = resolve(outputDir, `${latestArchiveBaseName}.tar.gz`);
const latestChecksumPath = `${latestArchivePath}.sha256`;
const legacyArchiveBaseName = archiveNames.legacyBaseName;
const legacyArchivePath = resolve(outputDir, `${legacyArchiveBaseName}.tar.gz`);
const legacyChecksumPath = `${legacyArchivePath}.sha256`;
const sourceRootName = archiveBaseName;
const tempRoot = mkdtempSync(resolve(tmpdir(), 'kaur-khor-source-release-'));
const stageRoot = resolve(tempRoot, sourceRootName);

const includeRoots = [
  'apps/desktop-core',
  'apps/sena-core',
  'resources',
  'config',
  'src/icons',
  'src/main',
  'src/preload',
  'src/renderer',
  'src/shared',
];

const includeFiles = new Set([
  'components.json',
  'config/package/electron-builder.unsigned-win.yml',
  'config/package/electron-builder.yml',
  'config/build/electron.vite.config.ts',
  'index.html',
  'LICENSE',
  'package.json',
  'pnpm-lock.yaml',
  'tools/scripts/after-pack-win-unsigned-icon.mjs',
  'tools/scripts/build-from-source.mjs',
  'tools/scripts/build-from-source.ps1',
  'tools/scripts/build-from-source.sh',
  'tools/scripts/build-mac-from-source.sh',
  'tools/scripts/package-linux.sh',
  'tools/scripts/package-mac.sh',
  'tools/scripts/package-source-release.mjs',
  'tools/scripts/update-support.mjs',
  'tools/scripts/package-win-native.mjs',
  'tools/scripts/stage-desktop-core.mjs',
  'src/renderer/src/assets/help/user-guide.km.md',
  'src/renderer/src/assets/help/user-guide.md',
  'src/renderer/index.html',
  'config/tsconfig.json',
  'config/tsconfig.node.json',
  'config/tsconfig.web.json',
]);

try {
  mkdirSync(stageRoot, { recursive: true });
  const trackedFiles = gitLsFiles();
  for (const filePath of trackedFiles) {
    if (!shouldInclude(filePath)) {
      continue;
    }
    copyTrackedFile(filePath);
  }
  for (const filePath of includeFiles) {
    if (!isExcluded(filePath)) {
      copyTrackedFile(filePath);
    }
  }

  writeFileSync(resolve(stageRoot, '.kaur-khor-source-build-release'), `${releaseTag}\n`);
  writeFileSync(resolve(stageRoot, 'SOURCE-BUILD-README.md'), sourceBuildReadme());
  writePackageJsonVersion(resolve(stageRoot, 'package.json'));

  mkdirSync(outputDir, { recursive: true });
  rmSync(archivePath, { force: true });
  rmSync(checksumPath, { force: true });
  rmSync(latestArchivePath, { force: true });
  rmSync(latestChecksumPath, { force: true });
  rmSync(legacyArchivePath, { force: true });
  rmSync(legacyChecksumPath, { force: true });
  run('tar', ['-czf', archivePath, '-C', tempRoot, sourceRootName]);

  const checksum = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  writeFileSync(checksumPath, `${checksum}  ${archiveBaseName}.tar.gz\n`);
  copyFileSync(archivePath, latestArchivePath);
  writeFileSync(latestChecksumPath, `${checksum}  ${latestArchiveBaseName}.tar.gz\n`);
  copyFileSync(archivePath, legacyArchivePath);
  writeFileSync(legacyChecksumPath, `${checksum}  ${legacyArchiveBaseName}.tar.gz\n`);
  console.log(`Wrote ${archivePath}`);
  console.log(`Wrote ${checksumPath}`);
  console.log(`Wrote ${latestArchivePath}`);
  console.log(`Wrote ${latestChecksumPath}`);
  console.log(`Wrote ${legacyArchivePath}`);
  console.log(`Wrote ${legacyChecksumPath}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function resolveReleaseVersion() {
  const explicitVersion = process.env.KAUR_KHOR_SOURCE_RELEASE_VERSION || process.env.RELEASE_TAG;
  if (explicitVersion) {
    return explicitVersion.replace(/^v/, '');
  }
  return packageJson.version;
}

function gitLsFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error('git ls-files failed');
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function shouldInclude(filePath) {
  if (includeFiles.has(filePath)) {
    return !isExcluded(filePath);
  }
  return includeRoots.some((rootPath) => filePath === rootPath || filePath.startsWith(`${rootPath}/`)) && !isExcluded(filePath);
}

function isExcluded(filePath) {
  if (/\.(?:test|spec)\.(?:[cm]?js|tsx?)$/i.test(filePath)) {
    return true;
  }
  if (/\.(png|jpe?g|webp|gif)$/i.test(filePath)) {
    return true;
  }
  if (/\.svg$/i.test(filePath) && !filePath.startsWith('src/renderer/src/assets/kaur-khor')) {
    return true;
  }
  if (filePath.includes('/__snapshots__/') || filePath.includes('/fixtures/') || filePath.includes('/tests/')) {
    return true;
  }
  if (filePath.startsWith('src/renderer/src/assets/dev-catalog/')) {
    return true;
  }
  return false;
}

function copyTrackedFile(filePath) {
  const sourcePath = resolve(root, filePath);
  const destinationPath = resolve(stageRoot, filePath);
  if (!existsSync(sourcePath)) {
    return;
  }
  mkdirSync(dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
}

function writePackageJsonVersion(packageJsonPath) {
  const stagedPackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  stagedPackageJson.version = releaseVersion.replace(/^v/, '');
  writeFileSync(packageJsonPath, `${JSON.stringify(stagedPackageJson, null, 2)}\n`);
}

function sourceBuildReadme() {
  return `# Kaur Khor production source build

This archive contains only the files needed to build and package the production desktop app locally.
It intentionally excludes developer docs, benchmark suites, screenshots, tests, web marketing images, and sample product photos.

Run the source-build script for your platform:

- macOS/Linux: ./tools/scripts/build-from-source.sh
- Windows: .\\scripts\\build-from-source.ps1

The script installs project dependencies, compiles the Rust desktop runtime, and packages the native desktop app for the current computer.
`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}
