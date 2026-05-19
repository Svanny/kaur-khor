import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative } from 'node:path';

const DESKTOP_ASSET_PROTOCOL = 'kaur-khor-asset';
const DESKTOP_ASSET_HOST = 'local';
const DESKTOP_ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function isPathInsideRoot(candidatePath: string, rootPath: string) {
  const relativePath = relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export async function resolveDesktopAssetPathFromRequest(requestUrl: string, assetDirectoryPath: string) {
  let requestedAssetName: string;
  try {
    const assetUrl = new URL(requestUrl);
    if (assetUrl.protocol !== `${DESKTOP_ASSET_PROTOCOL}:` || assetUrl.hostname !== DESKTOP_ASSET_HOST) {
      return null;
    }
    if (assetUrl.username || assetUrl.password) {
      return null;
    }

    requestedAssetName = decodeURIComponent(assetUrl.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }

  if (!requestedAssetName || requestedAssetName.includes('/') || requestedAssetName.includes('\\')) {
    return null;
  }

  const assetExtension = extname(requestedAssetName).toLowerCase();
  if (!DESKTOP_ALLOWED_IMAGE_EXTENSIONS.has(assetExtension)) {
    return null;
  }

  const candidatePath = join(assetDirectoryPath, requestedAssetName);
  const [assetRoot, candidateStats, candidateRealPath] = await Promise.all([
    realpath(assetDirectoryPath).catch(() => null),
    stat(candidatePath).catch(() => null),
    realpath(candidatePath).catch(() => null),
  ]);
  if (!assetRoot || !candidateStats?.isFile() || !candidateRealPath) {
    return null;
  }
  if (!isPathInsideRoot(candidateRealPath, assetRoot)) {
    return null;
  }

  return candidateRealPath;
}
