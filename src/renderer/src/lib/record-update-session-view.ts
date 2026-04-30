export type SessionViewMode = 'pos' | 'form';

export const DEFAULT_SESSION_VIEW_MODE: SessionViewMode = 'pos';

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const storage = window.localStorage;
    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    ) {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

function isSessionViewMode(value: unknown): value is SessionViewMode {
  return value === 'pos' || value === 'form';
}

export function recordUpdateSessionViewStorageKey() {
  return 'banji:record-update:view:v1';
}

export function readRecordUpdateSessionViewMode(): SessionViewMode {
  const storage = getBrowserStorage();
  if (!storage) {
    return DEFAULT_SESSION_VIEW_MODE;
  }
  try {
    const value = storage.getItem(recordUpdateSessionViewStorageKey());
    return isSessionViewMode(value) ? value : DEFAULT_SESSION_VIEW_MODE;
  } catch {
    return DEFAULT_SESSION_VIEW_MODE;
  }
}

export function writeRecordUpdateSessionViewMode(mode: SessionViewMode) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(recordUpdateSessionViewStorageKey(), mode);
  } catch {
    // Ignore unavailable storage and keep the in-memory default behavior.
  }
}
