// @vitest-environment node

import { mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDesktopAssetPathFromRequest } from './desktop-asset-protocol';

describe('resolveDesktopAssetPathFromRequest', () => {
  it('resolves managed image assets by basename', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-assets-'));
    const assetPath = join(assetDir, 'sku.png');
    await writeFile(assetPath, new Uint8Array([1, 2, 3]));

    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://local/sku.png', assetDir)).resolves.toBe(
      await realpath(assetPath),
    );
  });

  it('rejects traversal paths and unsupported extensions', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-assets-'));
    await writeFile(join(assetDir, 'secret.png'), new Uint8Array([1, 2, 3]));

    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://local/../secret.png', assetDir)).resolves.toBeNull();
    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://local/%2e%2e/secret.png', assetDir)).resolves.toBeNull();
    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://local/%2E%2E%2Fsecret.png', assetDir)).resolves.toBeNull();
    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://local/catalog.svg', assetDir)).resolves.toBeNull();
  });

  it('rejects credential-bearing asset URLs', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-assets-'));
    await writeFile(join(assetDir, 'sku.png'), new Uint8Array([1, 2, 3]));

    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://user:pass@local/sku.png', assetDir)).resolves.toBeNull();
  });

  it('rejects symlinked assets that resolve outside the managed asset directory', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-assets-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'kaur-khor-secret-assets-'));
    const secretPath = join(outsideDir, 'secret.png');
    await writeFile(secretPath, new Uint8Array([1, 2, 3]));
    await symlink(secretPath, join(assetDir, 'linked.png'));

    await expect(resolveDesktopAssetPathFromRequest('kaur-khor-asset://local/linked.png', assetDir)).resolves.toBeNull();
  });
});
