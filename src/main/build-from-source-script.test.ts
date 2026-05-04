import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const scriptPath = resolve('scripts/build-from-source.mjs');
const shellBootstrapPath = resolve('scripts/build-from-source.sh');

function runScript(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
  });
}

function runShellBootstrap(args: string[]) {
  return spawnSync('sh', [shellBootstrapPath, ...args], {
    encoding: 'utf8',
  });
}

function expectedNativeTarget() {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return { id: 'mac-arm64', packageCommand: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:mac' };
  }

  if (process.platform === 'darwin' && process.arch === 'x64') {
    return { id: 'mac-x64', packageCommand: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:mac' };
  }

  if (process.platform === 'linux' && process.arch === 'arm64') {
    return { id: 'linux-arm64', packageCommand: 'pnpm package:linux' };
  }

  if (process.platform === 'linux' && process.arch === 'x64') {
    return { id: 'linux-x64', packageCommand: 'pnpm package:linux' };
  }

  if (process.platform === 'win32' && process.arch === 'x64') {
    return { id: 'windows-x64', packageCommand: 'ALLOW_UNSIGNED_PACKAGING=1 pnpm package:win:native' };
  }

  return null;
}

describe('build-from-source script', () => {
  test('prints help without starting dependency installation', () => {
    const result = runScript(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--platform=<target>');
    expect(result.stdout).toContain('BANJI_BUILD_DIR');
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
});
