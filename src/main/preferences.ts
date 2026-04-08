import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SENA_ENGINE_PARAMETERS,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeDesktopPreferenceTimestamp,
  normalizeSenaEngineParameters,
  type DesktopPreferences,
} from '@shared/ipc';

const DEFAULT_PREFERENCES: DesktopPreferences = {
  language: 'en',
  currency: 'USD',
  usdToKhrExchangeRate: DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  showExplanatoryTooltips: true,
  showFloatingTitleActions: true,
  showRightRailCards: true,
  senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
  overviewStaleUpdateReminderSnoozeUntil: null,
};
let preferencesWriteQueue: Promise<void> = Promise.resolve();

function preferencesPath(userDataPath: string) {
  return join(userDataPath, 'desktop-preferences.json');
}

function normalizeUsdToKhrExchangeRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USD_TO_KHR_EXCHANGE_RATE;
}

function normalizePreferences(value: Partial<DesktopPreferences> | null | undefined): DesktopPreferences {
  return {
    language: value?.language === 'km' ? 'km' : 'en',
    currency: value?.currency === 'KHR' ? 'KHR' : 'USD',
    usdToKhrExchangeRate: normalizeUsdToKhrExchangeRate(value?.usdToKhrExchangeRate),
    showExplanatoryTooltips: value?.showExplanatoryTooltips ?? true,
    showFloatingTitleActions: value?.showFloatingTitleActions ?? true,
    showRightRailCards: value?.showRightRailCards ?? true,
    senaEngineParameters: normalizeSenaEngineParameters(value?.senaEngineParameters),
    overviewStaleUpdateReminderSnoozeUntil: normalizeDesktopPreferenceTimestamp(
      value?.overviewStaleUpdateReminderSnoozeUntil,
    ),
  };
}

export async function loadDesktopPreferences(userDataPath: string): Promise<DesktopPreferences> {
  try {
    const raw = await readFile(preferencesPath(userDataPath), 'utf8');
    if (!raw.trim()) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<DesktopPreferences>;
    return normalizePreferences(parsed);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveDesktopPreferences(
  userDataPath: string,
  next: Partial<DesktopPreferences>,
): Promise<DesktopPreferences> {
  const writeOperation = preferencesWriteQueue.then(async () => {
    const current = await loadDesktopPreferences(userDataPath);
    const merged = normalizePreferences({
      ...current,
      ...next,
    });
    const path = preferencesPath(userDataPath);
    await mkdir(userDataPath, { recursive: true });
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(merged, null, 2), 'utf8');
    await rename(tempPath, path);
    return merged;
  });

  preferencesWriteQueue = writeOperation.then(
    () => undefined,
    () => undefined,
  );

  return writeOperation;
}
