// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      return [fullPath];
    }
    return [];
  });
}

function sourceFilesUnder(...directories: string[]) {
  return directories
    .flatMap((directory) => collectSourceFiles(directory))
    .filter((filePath) => !filePath.endsWith('icon-import-boundary.test.ts'));
}

describe('icon import boundaries', () => {
  it('keeps lucide-react imports inside src/icons only', () => {
    const sourceFiles = sourceFilesUnder(
      join(projectRoot, 'src/main'),
      join(projectRoot, 'src/renderer/src'),
    );

    const offenders = sourceFiles.filter((filePath) => {
      const contents = readFileSync(filePath, 'utf8');
      return (
        contents.includes("from 'lucide-react'") ||
        contents.includes('from "lucide-react"')
      );
    });

    expect(offenders).toEqual([]);
  });

  it('does not import retired icon modules', () => {
    const sourceFiles = sourceFilesUnder(
      join(projectRoot, 'src/main'),
      join(projectRoot, 'src/renderer/src'),
    );

    const forbiddenPatterns = [
      '@/lib/icon-mappings',
      '@/components/system/new-service-icon',
      '@/components/icons/notebook-text-dashed',
      "from './icon'",
      'from "./icon"',
    ];

    const offenders = sourceFiles.filter((filePath) => {
      const contents = readFileSync(filePath, 'utf8');
      return forbiddenPatterns.some((pattern) => contents.includes(pattern));
    });

    expect(offenders).toEqual([]);
  });
});
