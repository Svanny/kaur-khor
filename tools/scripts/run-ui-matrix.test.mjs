// @vitest-environment node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    spawn: vi.fn(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0));
      return child;
    }),
  };
});

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('KAUR_KHOR_DESKTOP_CORE_BINARY', undefined);
  vi.stubEnv('KAUR_KHOR_UI_MATRIX_WORKERS', undefined);
  vi.stubEnv('KAUR_KHOR_UI_MATRIX_SERIAL', undefined);
  process.argv = ['node', 'tools/scripts/run-ui-matrix.mjs'];
  vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`); });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('UI matrix runner core launch environment', () => {
  test.each(['all', 'desktop'])('uses the prebuilt core for %s without changing test parallelism', async (target) => {
    process.argv.push(`--target=${target}`);
    await expect(import('./run-ui-matrix.mjs')).rejects.toThrow('exit:0');
    expect(spawn.mock.calls[0].slice(0, 2)).toEqual(['pnpm', ['build']]);
    expect(spawn.mock.calls[1].slice(0, 2)).toEqual([
      'cargo', ['build', '--manifest-path', resolve('apps/desktop-core/Cargo.toml')],
    ]);
    const [, args, options] = spawn.mock.calls.at(-1);
    expect(args).toContain('playwright');
    expect(options.env.KAUR_KHOR_DESKTOP_CORE_BINARY).toBe(resolve(
      'apps/desktop-core/target/debug',
      process.platform === 'win32' ? 'kaur-khor-desktop-core.exe' : 'kaur-khor-desktop-core',
    ));
    expect(options.env.KAUR_KHOR_UI_MATRIX_WORKERS).toBe('3');
  });

  test('preserves an explicit core binary override', async () => {
    vi.stubEnv('KAUR_KHOR_DESKTOP_CORE_BINARY', '/custom/core');
    await expect(import('./run-ui-matrix.mjs')).rejects.toThrow('exit:0');
    expect(spawn.mock.calls.at(-1)[2].env.KAUR_KHOR_DESKTOP_CORE_BINARY).toBe('/custom/core');
  });

  test.each(['web', 'mobile'])('does not require a desktop core build for %s', async (target) => {
    process.argv.push(`--target=${target}`);
    await expect(import('./run-ui-matrix.mjs')).rejects.toThrow('exit:0');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][2].env.KAUR_KHOR_DESKTOP_CORE_BINARY).toBeUndefined();
  });

  test('does not run the matrix after a failed build', async () => {
    const { EventEmitter } = await import('node:events');
    spawn.mockImplementationOnce(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 1));
      return child;
    });
    await expect(import('./run-ui-matrix.mjs')).rejects.toThrow('exit:1');
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
