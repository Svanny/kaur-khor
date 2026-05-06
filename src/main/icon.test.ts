// @vitest-environment node

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasMacDockIconPair, macIconAssets } from '@icons/native';

describe('mac icon assets', () => {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

  it('resolves the generated dock and package icon paths', () => {
    const assets = macIconAssets(projectRoot);

    expect(assets.dockIconPath).toBe(join(projectRoot, 'resources', 'mac', 'icon.png'));
    expect(assets.retinaDockIconPath).toBe(join(projectRoot, 'resources', 'mac', 'icon@2x.png'));
    expect(assets.packagedIconPath).toBe(join(projectRoot, 'resources', 'mac', 'kaur-khor.icns'));
  });

  it('expects the macOS dock icon pair to exist in the repo', () => {
    const assets = macIconAssets(projectRoot);

    expect(hasMacDockIconPair(projectRoot)).toBe(true);
    expect(existsSync(assets.packagedIconPath)).toBe(true);
  });
});
