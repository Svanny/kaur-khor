// @vitest-environment node

import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeAllowedLocalDataPath } from './local-path-access';

describe('normalizeAllowedLocalDataPath', () => {
  it('allows paths inside configured local data roots', () => {
    expect(normalizeAllowedLocalDataPath('/tmp/kaur-khor/workspace.sqlite', ['/tmp/kaur-khor'])).toBe(
      '/tmp/kaur-khor/workspace.sqlite',
    );
  });

  it('rejects paths outside configured local data roots', () => {
    expect(() => normalizeAllowedLocalDataPath('/etc/passwd', ['/tmp/kaur-khor'])).toThrow(
      'Only kaur khor workspace paths can be revealed.',
    );
  });

  it('rejects sibling paths that only share a string prefix', () => {
    expect(() => normalizeAllowedLocalDataPath('/tmp/kaur-khor-other/file.txt', ['/tmp/kaur-khor'])).toThrow(
      'Only kaur khor workspace paths can be revealed.',
    );
  });

  it('resolves nested segments before checking the path boundary', () => {
    expect(() => normalizeAllowedLocalDataPath(join('/tmp/kaur-khor', '..', 'secret.txt'), ['/tmp/kaur-khor'])).toThrow(
      'Only kaur khor workspace paths can be revealed.',
    );
  });

  it('rejects symlinks inside the data root that resolve outside it', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'kaur-khor-local-path-root-'));
    const outsidePath = await mkdtemp(join(tmpdir(), 'kaur-khor-local-path-outside-'));
    const secretPath = join(outsidePath, 'secret.txt');
    await writeFile(secretPath, 'secret');
    const linkedPath = join(rootPath, 'linked-secret.txt');
    await symlink(secretPath, linkedPath);

    expect(() => normalizeAllowedLocalDataPath(linkedPath, [rootPath])).toThrow(
      'Only kaur khor workspace paths can be revealed.',
    );
  });

  it('rejects missing children below symlinked directories outside the data root', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'kaur-khor-local-path-root-'));
    const outsidePath = await mkdtemp(join(tmpdir(), 'kaur-khor-local-path-outside-'));
    const linkedDirectoryPath = join(rootPath, 'linked-outside');
    await symlink(outsidePath, linkedDirectoryPath);

    expect(() => normalizeAllowedLocalDataPath(join(linkedDirectoryPath, 'missing.txt'), [rootPath])).toThrow(
      'Only kaur khor workspace paths can be revealed.',
    );
  });
});
