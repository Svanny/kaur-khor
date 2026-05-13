import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';

const scriptPath = resolve('scripts/build-from-source.mjs');
const shellBootstrapPath = resolve('scripts/build-from-source.sh');
const powershellBootstrapPath = resolve('scripts/build-from-source.ps1');

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env,
  });
}

function runShellBootstrap(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('/bin/sh', [shellBootstrapPath, ...args], {
    encoding: 'utf8',
    env,
  });
}

function writeExecutable(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function createShellBootstrapFixture(expectedSha256: string, tarScript: string) {
  const root = mkdtempSync(join(tmpdir(), 'kaur-khor-build-source-test-'));
  const fakeBin = join(root, 'bin');
  const toolsDir = join(root, 'tools');
  const tarMarker = join(root, 'tar-called');

  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(toolsDir, { recursive: true });
  writeExecutable(join(fakeBin, 'uname'), `#!/bin/sh
if [ "$1" = "-s" ]; then
  printf 'Darwin\\n'
else
  printf 'arm64\\n'
fi
`);
  writeExecutable(join(fakeBin, 'curl'), `#!/bin/sh
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    shift
    destination="$1"
  fi
  shift
done
printf 'node archive fixture' > "$destination"
`);
  writeExecutable(join(fakeBin, 'shasum'), `#!/bin/sh
printf '%s  %s\\n' "$KAUR_KHOR_FAKE_SHA256" "$3"
`);
  writeExecutable(join(fakeBin, 'tar'), tarScript);

  return {
    root,
    tarMarker,
    env: {
      ...process.env,
      HOME: root,
      PATH: `${fakeBin}:/bin:/usr/bin`,
      KAUR_KHOR_BUILD_TOOLS_DIR: toolsDir,
      KAUR_KHOR_FAKE_SHA256: expectedSha256,
      KAUR_KHOR_TAR_MARKER: tarMarker,
      TMPDIR: root,
    },
  };
}

function createSourceBuildToolchainFixture({
  cargoVersion,
  rustupExitCode = 0,
}: {
  cargoVersion: string;
  rustupExitCode?: number;
}) {
  const root = mkdtempSync(join(tmpdir(), 'kaur-khor-build-source-toolchain-test-'));
  const fakeBin = join(root, 'bin');
  const cargoHomeBin = join(root, '.cargo', 'bin');
  const rustupMarker = join(root, 'rustup-called');
  const pnpmMarker = join(root, 'pnpm-called');

  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(cargoHomeBin, { recursive: true });
  writeExecutable(join(fakeBin, 'cargo'), `#!/bin/sh
printf 'cargo ${cargoVersion} (fixture)\\n'
`);
  writeExecutable(join(fakeBin, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$KAUR_KHOR_PNPM_MARKER"
`);
  writeExecutable(join(fakeBin, 'rustup'), `#!/bin/sh
printf '%s\\n' "$*" >> "$KAUR_KHOR_RUSTUP_MARKER"
exit ${rustupExitCode}
`);
  writeExecutable(join(cargoHomeBin, 'cargo'), `#!/bin/sh
printf 'cargo 1.85.0 (fixture)\\n'
`);
  writeExecutable(join(fakeBin, 'xcode-select'), `#!/bin/sh
printf '/Applications/Xcode.app/Contents/Developer\\n'
`);
  writeExecutable(join(fakeBin, 'cc'), `#!/bin/sh
exit 0
`);
  writeExecutable(join(fakeBin, 'open'), `#!/bin/sh
exit 0
`);
  writeExecutable(join(fakeBin, 'xdg-open'), `#!/bin/sh
exit 0
`);

  return {
    root,
    pnpmMarker,
    rustupMarker,
    env: {
      ...process.env,
      HOME: root,
      PATH: `${fakeBin}:/bin:/usr/bin`,
      KAUR_KHOR_SKIP_RUST_TESTS: '1',
      KAUR_KHOR_PNPM_MARKER: pnpmMarker,
      KAUR_KHOR_RUSTUP_MARKER: rustupMarker,
    },
  };
}

function expectedNativeTarget() {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return { aliases: ['darwin-arm64'], id: 'mac-arm64', packageCommand: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:mac' };
  }

  if (process.platform === 'darwin' && process.arch === 'x64') {
    return { aliases: ['darwin-x64'], id: 'mac-x64', packageCommand: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:mac' };
  }

  if (process.platform === 'linux' && process.arch === 'arm64') {
    return { aliases: [], id: 'linux-arm64', packageCommand: 'pnpm package:linux' };
  }

  if (process.platform === 'linux' && process.arch === 'x64') {
    return { aliases: ['linux-amd64', 'linux-x86_64'], id: 'linux-x64', packageCommand: 'pnpm package:linux' };
  }

  if (process.platform === 'win32' && process.arch === 'x64') {
    return { aliases: ['win-x64'], id: 'windows-x64', packageCommand: '$env:ALLOW_UNSIGNED_PACKAGING="1"; pnpm package:win:native' };
  }

  return null;
}

describe('build-from-source script', () => {
  test('prints help without starting dependency installation', () => {
    const result = runScript(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--platform=<target>');
    expect(result.stdout).toContain('KAUR_KHOR_BUILD_DIR');
  });

  test('resolves the native host platform without packaging', () => {
    const expected = expectedNativeTarget();
    const result = runScript(['--resolve-only']);

    if (!expected) {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Unsupported host platform');
      return;
    }

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`platform=${expected.id}`);
    expect(result.stdout).toContain(`package=${expected.packageCommand}`);
  });

  test('rejects non-native target selection', () => {
    const expected = expectedNativeTarget();
    if (!expected) {
      return;
    }

    const nonNativeTarget = ['mac-arm64', 'mac-x64', 'linux-arm64', 'linux-x64', 'windows-x64']
      .find((target) => target !== expected.id)!;
    const result = runScript([`--platform=${nonNativeTarget}`, '--resolve-only']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('native-only');
    expect(result.stderr).toContain(nonNativeTarget);
  });

  test('accepts explicit native target selection without packaging', () => {
    const expected = expectedNativeTarget();
    if (!expected) {
      return;
    }

    const result = runScript([`--platform=${expected.id}`, '--resolve-only']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`platform=${expected.id}`);
  });

  test('accepts native platform aliases without packaging', () => {
    const expected = expectedNativeTarget();
    if (!expected?.aliases.length) {
      return;
    }

    for (const alias of expected.aliases) {
      const result = runScript([`--platform=${alias}`, '--resolve-only']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`platform=${expected.id}`);
    }
  });

  test('shell bootstrap delegates without requiring git in the command path', () => {
    const expected = expectedNativeTarget();
    const result = runShellBootstrap(['--resolve-only']);

    if (!expected) {
      expect(result.status).not.toBe(0);
      return;
    }

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`platform=${expected.id}`);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('git clone');
  });

  test('shell bootstrap refuses a Node archive with a bad digest before extraction', () => {
    const fixture = createShellBootstrapFixture('0'.repeat(64), `#!/bin/sh
printf 'called' > "$KAUR_KHOR_TAR_MARKER"
exit 77
`);
    const result = runShellBootstrap(['--resolve-only'], fixture.env);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SHA-256 mismatch for node-v22.21.1-darwin-arm64.tar.xz');
    expect(existsSync(fixture.tarMarker)).toBe(false);
  });

  test('shell bootstrap extracts a Node archive after digest verification', () => {
    const fixture = createShellBootstrapFixture(
      '39f53ffcf1604291e85974c8588bb290c14b358ac085e342920e703651d63c5e',
      `#!/bin/sh
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-C" ]; then
    shift
    destination="$1"
  fi
  shift
done
printf 'called' > "$KAUR_KHOR_TAR_MARKER"
node_dir="$destination/node-v22.21.1-darwin-arm64/bin"
mkdir -p "$node_dir"
cat > "$node_dir/node" <<'NODE'
#!/bin/sh
printf 'verified fake node %s\\n' "$*"
printf 'PATH=%s\\n' "$PATH"
NODE
chmod +x "$node_dir/node"
`,
    );
    const result = runShellBootstrap(['--resolve-only'], fixture.env);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('verified fake node');
    expect(result.stdout).toContain(`${fixture.root}/tools/node-v22.21.1/bin`);
    expect(result.stdout).toContain('scripts/build-from-source.mjs --resolve-only');
    expect(existsSync(fixture.tarMarker)).toBe(true);
  });

  test('source build updates Rust stable when Cargo is too old for Edition 2024 crates', () => {
    const expected = expectedNativeTarget();
    if (!expected) {
      return;
    }

    const fixture = createSourceBuildToolchainFixture({ cargoVersion: '1.83.0' });
    const result = runScript([`--platform=${expected.id}`], fixture.env);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('older than 1.85.0');
    expect(readFileSync(fixture.rustupMarker, 'utf8')).toContain('toolchain install stable');
    expect(readFileSync(fixture.rustupMarker, 'utf8')).toContain('default stable');
    expect(readFileSync(fixture.pnpmMarker, 'utf8')).toContain('install --frozen-lockfile');
  }, 10_000);

  test('source build keeps current Cargo without invoking rustup', () => {
    const expected = expectedNativeTarget();
    if (!expected) {
      return;
    }

    const fixture = createSourceBuildToolchainFixture({ cargoVersion: '1.85.0' });
    const result = runScript([`--platform=${expected.id}`], fixture.env);

    expect(result.status).toBe(0);
    expect(existsSync(fixture.rustupMarker)).toBe(false);
    expect(readFileSync(fixture.pnpmMarker, 'utf8')).toContain('install --frozen-lockfile');
  });

  test('Cargo bootstrap puts updated rustup Cargo first for packaging child processes', async () => {
    const fixture = createSourceBuildToolchainFixture({ cargoVersion: '1.83.0' });
    const originalHome = process.env.HOME;
    const originalPath = process.env.PATH;
    process.env.HOME = fixture.root;
    process.env.PATH = fixture.env.PATH;
    process.env.KAUR_KHOR_RUSTUP_MARKER = fixture.rustupMarker;

    try {
      const { ensureCargo } = await import(pathToFileURL(scriptPath).href) as {
        ensureCargo: (target: { id: string; os: string; arch: string }) => Promise<string>;
      };
      const cargo = await ensureCargo({ id: 'windows-x64', os: 'windows', arch: 'x64' });
      const cargoHomeBin = join(fixture.root, '.cargo', 'bin');
      const pathDelimiter = process.platform === 'win32' ? ';' : ':';

      expect(cargo).toBe(join(cargoHomeBin, 'cargo'));
      expect(process.env.PATH?.split(pathDelimiter)[0]).toBe(cargoHomeBin);
      expect(readFileSync(fixture.rustupMarker, 'utf8')).toContain('toolchain install stable');
    } finally {
      process.env.HOME = originalHome;
      process.env.PATH = originalPath;
      delete process.env.KAUR_KHOR_RUSTUP_MARKER;
    }
  });

  test('Cargo bootstrap accepts rustup self-update cleanup failures after Cargo updates', async () => {
    const fixture = createSourceBuildToolchainFixture({ cargoVersion: '1.83.0', rustupExitCode: 1 });
    const originalHome = process.env.HOME;
    const originalPath = process.env.PATH;
    process.env.HOME = fixture.root;
    process.env.PATH = fixture.env.PATH;
    process.env.KAUR_KHOR_RUSTUP_MARKER = fixture.rustupMarker;

    try {
      const { ensureCargo } = await import(pathToFileURL(scriptPath).href) as {
        ensureCargo: (target: { id: string; os: string; arch: string }) => Promise<string>;
      };
      const cargo = await ensureCargo({ id: 'windows-x64', os: 'windows', arch: 'x64' });

      expect(cargo).toBe(join(fixture.root, '.cargo', 'bin', 'cargo'));
      expect(readFileSync(fixture.rustupMarker, 'utf8')).toContain('toolchain install stable');
      expect(readFileSync(fixture.rustupMarker, 'utf8')).toContain('default stable');
    } finally {
      process.env.HOME = originalHome;
      process.env.PATH = originalPath;
      delete process.env.KAUR_KHOR_RUSTUP_MARKER;
    }
  });

  test('PowerShell bootstrap pins the Windows Node archive before delegation', () => {
    const script = readFileSync(powershellBootstrapPath, 'utf8');

    expect(script).toContain('node-v${NodeVersion}-${NodePlatform}.zip');
    expect(script).toContain('3c624e9fbe07e3217552ec52a0f84e2bdc2e6ffa7348f3fdfb9fbf8f42e23fcf');
    expect(script).toContain('Get-FileHash -Algorithm SHA256');
    expect(script).toContain('Remove-Item -Force $ArchivePath');
    expect(script).toContain('build-from-source.mjs');
  });

  test('Windows packaging applies app icon without signing tools for unsigned local packages', () => {
    const script = readFileSync(resolve('scripts/package-win-native.mjs'), 'utf8');
    const unsignedConfig = readFileSync(resolve('electron-builder.unsigned-win.yml'), 'utf8');
    const iconHook = readFileSync(resolve('scripts/after-pack-win-unsigned-icon.mjs'), 'utf8');
    const packageJson = readFileSync(resolve('package.json'), 'utf8');

    expect(script).toContain("const isUnsignedLocalPackage = process.env.ALLOW_UNSIGNED_PACKAGING === '1' && !hasWindowsSigningConfig");
    expect(script).toContain("const electronBuilderConfig = isUnsignedLocalPackage ? 'electron-builder.unsigned-win.yml' : 'electron-builder.yml'");
    expect(script).toContain("process.env.ELECTRON_BUILDER_DISABLE_BUILD_CACHE = 'true'");
    expect(script).toContain('ensureProjectDependencies();');
    expect(script).toContain("hasResolvablePackage('rcedit')");
    expect(script).toContain("'install', '--frozen-lockfile'");
    expect(unsignedConfig).toContain('extends: ./electron-builder.yml');
    expect(unsignedConfig).toContain('afterPack: ./scripts/after-pack-win-unsigned-icon.mjs');
    expect(unsignedConfig).toContain('signAndEditExecutable: false');
    expect(unsignedConfig).toContain("    - '!.exe'");
    expect(iconHook).toContain("import { rcedit } from 'rcedit'");
    expect(iconHook).toContain("resources/windows/kaur-khor.ico");
    expect(iconHook).toContain("await rcedit(exePath");
    expect(packageJson).toContain('"rcedit": "5.0.2"');
  });

  test('Windows packaging opens the generated installer for interactive local packaging', () => {
    const script = readFileSync(resolve('scripts/package-win-native.mjs'), 'utf8');

    expect(script).toContain('handoffInstaller();');
    expect(script).toContain("const releaseDir = resolve(root, 'release');");
    expect(script).toContain('findWindowsInstaller(releaseDir)');
    expect(script).toContain('shouldSkipInstallerHandoff()');
    expect(script).toContain('spawnSync(installerPath, []');
    expect(script).toContain("stdio: 'inherit'");
    expect(script).toContain('windowsHide: false');
    expect(script).toContain('Windows setup finished. You can now close this terminal window.');
    expect(script).toContain('Windows installer is ready at ${installerPath}.');
    expect(script).toContain('Skipping installer launch because this build is running in CI or non-interactive mode.');
    expect(script).toContain("process.env.KAUR_KHOR_SKIP_INSTALLER_HANDOFF === '1'");
    expect(script).toContain("process.env.GITHUB_ACTIONS === 'true'");
    expect(script).toContain("process.env.CI === 'true'");
    expect(script).toContain('/^kaur-khor-v.+-win-x64\\.exe$/.test(entry)');
    expect(script).toContain('opening release folder instead');
    expect(script).toContain("spawn('explorer.exe', [releaseDir]");
  });

  test('source build wrapper leaves Windows post-build handoff to the installer script', () => {
    const script = readFileSync(scriptPath, 'utf8');

    expect(script).toContain("if (target.os === 'mac') {");
    expect(script).toContain('openReleaseFolder(sourceRoot, target);');
    expect(script).toContain("target.os === 'windows'\n      ? ['win-unpacked']");
  });

  test('Linux packaging installs the generated deb and falls back to release folder', () => {
    const script = readFileSync(resolve('scripts/package-linux.sh'), 'utf8');
    const sourceScript = readFileSync(scriptPath, 'utf8');

    expect(sourceScript).toContain('const linuxInstallEnv = prepareLinuxInstallPrivilege(target);');
    expect(sourceScript).toContain('Requesting sudo now so the generated .deb can be installed after packaging...');
    expect(sourceScript).toContain("KAUR_KHOR_LINUX_INSTALL_PRECHECK: 'ready'");
    expect(script).toContain('find_deb_installer()');
    expect(script).toContain('kaur-khor-v*-linux-${target_arch}.deb');
    expect(script).toContain('KAUR_KHOR_LINUX_INSTALL_PRECHECK');
    expect(script).toContain('sudo -v');
    expect(script).toContain('install_deb="$(mktemp --tmpdir "kaur-khor-${target_arch}.XXXXXX.deb")"');
    expect(script).toContain('chmod 0644 "${install_deb}"');
    expect(script).toContain('trap \'rm -f "${install_deb}"\' EXIT');
    expect(script).toContain('DEBIAN_FRONTEND=noninteractive');
    expect(script).toContain('APT_LISTCHANGES_FRONTEND=none');
    expect(script).toContain('apt-get install --reinstall -y "${install_deb}"');
    expect(script).toContain('Linux install failed; opening release folder instead.');
    expect(script).toContain('Linux install finished. You can now close this terminal window.');
    expect(script).toContain('xdg-open "${release_dir}"');
  });

  test('source build skips Electron development binary download during install', () => {
    const script = readFileSync(scriptPath, 'utf8');

    expect(script).toContain("ELECTRON_SKIP_BINARY_DOWNLOAD: '1'");
    expect(script).toContain("runPnpm(pnpm, ['install', '--frozen-lockfile'], sourceRoot, {");
  });

  test('source build prefers production release archives before GitHub codeload archives', () => {
    const script = readFileSync(scriptPath, 'utf8');

    expect(script).toContain('KAUR_KHOR_SOURCE_ARCHIVE_URL');
    expect(script).toContain('githubReleaseSourceArchiveUrl(repo, ref)');
    expect(script).toContain('/releases/download/');
    expect(script).toContain('source-build.tar.gz');
    expect(script).toContain('Falling back to GitHub autogenerated source archive');
    expect(script).toContain('Skipping Rust desktop-core tests for the production source-build release.');
  });

  test('production source archive keeps logos and excludes developer collateral', () => {
    const script = readFileSync(resolve('scripts/package-source-release.mjs'), 'utf8');
    const packageJson = readFileSync(resolve('package.json'), 'utf8');
    const workflow = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

    expect(script).toContain('sourceBuildArchiveNames(releaseVersion)');
    expect(script).toContain('archiveNames.versionedBaseName');
    expect(script).toContain('archiveNames.latestBaseName');
    expect(script).toContain('copyFileSync(archivePath, latestArchivePath)');
    expect(script).toContain('kaur-khor-source-build');
    expect(script).toContain('src/renderer/src/assets/kaur-khor');
    expect(script).toContain("filePath.startsWith('src/renderer/src/assets/kaur-khor')");
    expect(script).toContain("filePath.startsWith('src/renderer/src/assets/dev-catalog/')");
    expect(script).toContain("filePath.includes('/tests/')");
    expect(script).toContain('/\\.(?:test|spec)\\.(?:[cm]?js|tsx?)$/i');
    expect(script).toContain('SOURCE-BUILD-README.md');
    expect(packageJson).toContain('"package:source": "node ./scripts/package-source-release.mjs"');
    expect(workflow).toContain('Build production source-build archive');
    expect(workflow).toContain('node scripts/package-source-release.mjs');
  });

  test('release workflow builds tag-specific release notes without stale hardcoded highlights', () => {
    const workflow = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain('node scripts/build-release-notes.mjs "${RUNNER_TEMP}/release-notes.md"');
    expect(workflow).not.toContain('Added a desktop-only Settings / Updates page');
    expect(workflow).not.toContain('Added pre-update snapshot export prompts');
    expect(workflow).not.toContain('Harmonized source-build archive names');
  });

  test('release note builder renders the current tag diff instead of stale feature copy', async () => {
    const { buildReleaseNotes } = await import(pathToFileURL(resolve('scripts/build-release-notes.mjs')).href) as {
      buildReleaseNotes: (input: {
        releaseTag: string;
        previousTag: string;
        changes: string[];
        signing: {
          macSigned: boolean;
          macNotarized: boolean;
          windowsSigned: boolean;
        };
      }) => string;
    };

    const notes = buildReleaseNotes({
      releaseTag: 'v0.5.2',
      previousTag: 'v0.5.1',
      changes: ['- fix(release): Generate tag-specific release notes (abc1234)'],
      signing: {
        macSigned: false,
        macNotarized: false,
        windowsSigned: true,
      },
    });

    expect(notes).toContain('Kaur Khor v0.5.2 includes the non-merge changes listed below');
    expect(notes).toContain('## Changes since v0.5.1');
    expect(notes).toContain('- fix(release): Generate tag-specific release notes (abc1234)');
    expect(notes).toContain('- Windows signing: yes');
    expect(notes).not.toContain('Added a desktop-only Settings / Updates page');
  });

  test('Windows packaging uses a Windows ico for installed app identity', () => {
    const config = readFileSync(resolve('electron-builder.yml'), 'utf8');

    expect(config).toContain('icon: resources/windows/kaur-khor.ico');
    expect(existsSync(resolve('resources/windows/kaur-khor.ico'))).toBe(true);
  });

  test('rustup verifier rejects a bad digest', async () => {
    const { verifySha256Buffer } = await import(pathToFileURL(scriptPath).href) as {
      verifySha256Buffer: (buffer: Buffer, expected: string, label: string) => void;
    };

    expect(() => verifySha256Buffer(Buffer.from('rustup fixture'), '0'.repeat(64), 'rustup-init test')).toThrow(
      /SHA-256 mismatch for rustup-init test/,
    );
  });

  test('rustup verifier accepts a matching digest', async () => {
    const { verifySha256Buffer } = await import(pathToFileURL(scriptPath).href) as {
      verifySha256Buffer: (buffer: Buffer, expected: string, label: string) => void;
    };
    const buffer = Buffer.from('rustup fixture');
    const digest = createHash('sha256').update(buffer).digest('hex');

    expect(() => verifySha256Buffer(buffer, digest, 'rustup-init test')).not.toThrow();
  });
});
