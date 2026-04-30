// @vitest-environment node

import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeAllowedLocalDataPath } from './local-path-access';

describe('normalizeAllowedLocalDataPath', () => {
  it('allows paths inside configured local data roots', () => {
    expect(normalizeAllowedLocalDataPath('/tmp/banji/workspace.sqlite', ['/tmp/banji'])).toBe(
      '/tmp/banji/workspace.sqlite',
    );
  });

  it('rejects paths outside configured local data roots', () => {
    expect(() => normalizeAllowedLocalDataPath('/etc/passwd', ['/tmp/banji'])).toThrow(
      'Only banji workspace paths can be revealed.',
    );
  });

  it('rejects sibling paths that only share a string prefix', () => {
    expect(() => normalizeAllowedLocalDataPath('/tmp/banji-other/file.txt', ['/tmp/banji'])).toThrow(
      'Only banji workspace paths can be revealed.',
    );
  });

  it('resolves nested segments before checking the path boundary', () => {
    expect(() => normalizeAllowedLocalDataPath(join('/tmp/banji', '..', 'secret.txt'), ['/tmp/banji'])).toThrow(
      'Only banji workspace paths can be revealed.',
    );
  });

  it('rejects symlinks inside the data root that resolve outside it', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'banji-local-path-root-'));
    const outsidePath = await mkdtemp(join(tmpdir(), 'banji-local-path-outside-'));
    const secretPath = join(outsidePath, 'secret.txt');
    await writeFile(secretPath, 'secret');
    const linkedPath = join(rootPath, 'linked-secret.txt');
    await symlink(secretPath, linkedPath);

    expect(() => normalizeAllowedLocalDataPath(linkedPath, [rootPath])).toThrow(
      'Only banji workspace paths can be revealed.',
    );
  });
});
