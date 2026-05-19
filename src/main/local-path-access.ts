import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

function canonicalizePath(path: string) {
  const normalizedPath = resolve(path);
  if (existsSync(normalizedPath)) {
    return realpathSync.native(normalizedPath);
  }

  const missingSegments: string[] = [];
  let currentPath = normalizedPath;
  while (!existsSync(currentPath)) {
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return normalizedPath;
    }
    missingSegments.unshift(basename(currentPath));
    currentPath = parentPath;
  }
  return resolve(realpathSync.native(currentPath), ...missingSegments);
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
    throw new Error('Only kaur khor workspace paths can be revealed.');
  }

  return normalizedPath;
}
