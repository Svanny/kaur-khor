// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'kaur-khor-electron-install-'));
const probe = join(directory, 'installer probe.cjs');
writeFileSync(probe, `
  require('node:child_process').spawnSync = (executable, args, options) => {
    process.stdout.write(JSON.stringify({ executable, args, windowsHide: options.windowsHide }));
    const value = process.env.KAUR_KHOR_TEST_INSTALL_STATUS;
    return { status: value === 'signal' ? null : Number(value) };
  };
`);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function run(status, skip = '0') {
  return spawnSync(process.execPath, ['--require', probe, resolve('tools/scripts/install-electron.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: skip, KAUR_KHOR_TEST_INSTALL_STATUS: status },
  });
}

test('source packaging can skip the development binary without running an installer', () => {
  const result = run('23', '1');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe('');
});

test.each([['0', 0], ['23', 23], ['signal', 1]])('installer outcome %s propagates as %i', (status, expected) => {
  const result = run(status);
  expect(result.status, result.stderr).toBe(expected);
  expect(JSON.parse(result.stdout)).toEqual({
    executable: process.execPath,
    args: [join(dirname(require.resolve('electron/package.json')), 'install.js')],
    windowsHide: true,
  });
});
