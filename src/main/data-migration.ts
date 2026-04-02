import { access, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DESKTOP_DATA_FILES = [
  'desktop-sena-store.sqlite3',
  'desktop-preferences.json',
] as const;

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function migrateLegacyDesktopData(
  currentDataPath: string,
  legacyDataPath: string,
) {
  if (currentDataPath === legacyDataPath) {
    return [] as string[];
  }

  const migratedFiles: string[] = [];
  await mkdir(currentDataPath, { recursive: true });

  for (const fileName of DESKTOP_DATA_FILES) {
    const currentFilePath = join(currentDataPath, fileName);
    if (await fileExists(currentFilePath)) {
      continue;
    }

    const legacyFilePath = join(legacyDataPath, fileName);
    if (!(await fileExists(legacyFilePath))) {
      continue;
    }

    await copyFile(legacyFilePath, currentFilePath);
    migratedFiles.push(fileName);
  }

  return migratedFiles;
}
