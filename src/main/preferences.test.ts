// @vitest-environment node

import { writeFile as realWriteFile } from 'node:fs/promises';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPreferencesModule() {
  return import('./preferences');
}

describe('desktop preferences store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
  });

  it('returns defaults when no file exists', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    const { loadDesktopPreferences } = await loadPreferencesModule();

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'en',
      currency: 'USD',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
    });
  });

  it('persists and merges preference updates', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await expect(
      saveDesktopPreferences(userDataPath, {
        language: 'km',
      }),
    ).resolves.toEqual({
      language: 'km',
      currency: 'USD',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
    });

    await expect(
      saveDesktopPreferences(userDataPath, {
        currency: 'KHR',
        showExplanatoryTooltips: false,
        showRightRailCards: false,
      }),
    ).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      showExplanatoryTooltips: false,
      showFloatingTitleActions: true,
      showRightRailCards: false,
    });

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      showExplanatoryTooltips: false,
      showFloatingTitleActions: true,
      showRightRailCards: false,
    });

    const raw = await readFile(join(userDataPath, 'desktop-preferences.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({
      language: 'km',
      currency: 'KHR',
      showExplanatoryTooltips: false,
      showFloatingTitleActions: true,
      showRightRailCards: false,
    });
  });

  it('serializes concurrent preference writes so later updates merge correctly', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    let releaseFirstWrite: (() => void) | null = null;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let shouldBlockFirstWrite = true;
    const mockedWriteFile = vi.fn(
      async (...args: Parameters<typeof realWriteFile>) => {
        if (shouldBlockFirstWrite) {
          shouldBlockFirstWrite = false;
          await firstWriteBlocked;
        }
        return realWriteFile(...args);
      },
    );

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
      return {
        ...actual,
        writeFile: mockedWriteFile,
      };
    });
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    const firstSave = saveDesktopPreferences(userDataPath, {
      language: 'km',
    });
    await vi.waitFor(() => {
      expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    });

    const secondSave = saveDesktopPreferences(userDataPath, {
      currency: 'KHR',
    });

    await Promise.resolve();
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);

    releaseFirstWrite?.();

    await expect(firstSave).resolves.toEqual({
      language: 'km',
      currency: 'USD',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
    });
    await expect(secondSave).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
    });
    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
    });
  });
});
