import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface MacIconAssets {
  directory: string;
  dockIconPath: string;
  retinaDockIconPath: string;
  packagedIconPath: string;
}

export function macIconAssets(projectRoot: string): MacIconAssets {
  const directory = join(projectRoot, 'resources/mac');
  return {
    directory,
    dockIconPath: join(directory, 'icon.png'),
    retinaDockIconPath: join(directory, 'icon@2x.png'),
    packagedIconPath: join(directory, 'banji.icns'),
  };
}

export function hasMacDockIconPair(projectRoot: string): boolean {
  const assets = macIconAssets(projectRoot);
  return existsSync(assets.dockIconPath) && existsSync(assets.retinaDockIconPath);
}
