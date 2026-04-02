// @vitest-environment node

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { migrateLegacyDesktopData } from './data-migration';

describe('legacy desktop data migration', () => {
  it('copies the SENA workspace store and preferences into the repo-local dev path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'banji-data-migration-'));
    const legacyPath = join(root, 'legacy');
    const currentPath = join(root, 'current');

    await mkdir(legacyPath, { recursive: true });
    await writeFile(
      join(legacyPath, 'desktop-sena-store.sqlite3'),
      'sqlite-fixture',
      'utf8',
    );
    await writeFile(
      join(legacyPath, 'desktop-preferences.json'),
      '{"language":"km","currency":"KHR"}',
      'utf8',
    );

    await expect(migrateLegacyDesktopData(currentPath, legacyPath)).resolves.toEqual([
      'desktop-sena-store.sqlite3',
      'desktop-preferences.json',
    ]);
    await expect(
      readFile(join(currentPath, 'desktop-sena-store.sqlite3'), 'utf8'),
    ).resolves.toBe('sqlite-fixture');
    await expect(
      readFile(join(currentPath, 'desktop-preferences.json'), 'utf8'),
    ).resolves.toBe('{"language":"km","currency":"KHR"}');
  });

  it('leaves files in place when the new dev path already has data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'banji-data-migration-'));
    const legacyPath = join(root, 'legacy');
    const currentPath = join(root, 'current');

    await mkdir(legacyPath, { recursive: true });
    await mkdir(currentPath, { recursive: true });
    await writeFile(
      join(legacyPath, 'desktop-preferences.json'),
      '{"language":"km","currency":"KHR"}',
      'utf8',
    );
    await writeFile(
      join(currentPath, 'desktop-preferences.json'),
      '{"language":"en","currency":"USD"}',
      'utf8',
    );

    await expect(migrateLegacyDesktopData(currentPath, legacyPath)).resolves.toEqual([]);
    await expect(
      readFile(join(currentPath, 'desktop-preferences.json'), 'utf8'),
    ).resolves.toBe('{"language":"en","currency":"USD"}');
  });
});
