// @vitest-environment node

import { existsSync } from 'node:fs';
import { macIconAssets, hasMacDockIconPair } from './icon';

describe('mac icon assets', () => {
  const projectRoot = '/Users/svanny/banji';

  it('resolves the generated dock and package icon paths', () => {
    const assets = macIconAssets(projectRoot);

    expect(assets.dockIconPath).toBe('/Users/svanny/banji/resources/mac/icon.png');
    expect(assets.retinaDockIconPath).toBe('/Users/svanny/banji/resources/mac/icon@2x.png');
    expect(assets.packagedIconPath).toBe('/Users/svanny/banji/resources/mac/banji.icns');
  });

  it('expects the macOS dock icon pair to exist in the repo', () => {
    expect(hasMacDockIconPair(projectRoot)).toBe(true);
    expect(existsSync('/Users/svanny/banji/resources/mac/banji.icns')).toBe(true);
  });
});
