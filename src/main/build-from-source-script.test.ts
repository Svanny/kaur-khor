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

function runScript(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
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
    return { aliases: ['win-x64'], id: 'windows-x64', packageCommand: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:win:native' };
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
NODE
chmod +x "$node_dir/node"
`,
    );
    const result = runShellBootstrap(['--resolve-only'], fixture.env);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('verified fake node');
    expect(result.stdout).toContain('scripts/build-from-source.mjs --resolve-only');
    expect(existsSync(fixture.tarMarker)).toBe(true);
  });

  test('PowerShell bootstrap pins the Windows Node archive before delegation', () => {
    const script = readFileSync(powershellBootstrapPath, 'utf8');

    expect(script).toContain('node-v${NodeVersion}-${NodePlatform}.zip');
    expect(script).toContain('3c624e9fbe07e3217552ec52a0f84e2bdc2e6ffa7348f3fdfb9fbf8f42e23fcf');
    expect(script).toContain('Get-FileHash -Algorithm SHA256');
    expect(script).toContain('build-from-source.mjs');
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
