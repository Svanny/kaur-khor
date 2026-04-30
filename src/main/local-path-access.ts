import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

function canonicalizePath(path: string) {
  return existsSync(path) ? realpathSync.native(path) : resolve(path);
}

function isPathInsideRoot(candidatePath: string, rootPath: string) {
  const relativePath = relative(canonicalizePath(rootPath), canonicalizePath(candidatePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export function normalizeAllowedLocalDataPath(targetPath: string, allowedRoots: string[]) {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('A local path is required.');
  }

  const normalizedPath = resolve(targetPath.trim());
  if (!allowedRoots.some((rootPath) => isPathInsideRoot(normalizedPath, rootPath))) {
    throw new Error('Only banji workspace paths can be revealed.');
  }

  return normalizedPath;
}
