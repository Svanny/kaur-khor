export type SessionViewMode = 'pos' | 'form';

export const DEFAULT_SESSION_VIEW_MODE: SessionViewMode = 'pos';

function canUseBrowserStorage() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.localStorage) &&
    typeof window.localStorage.getItem === 'function' &&
    typeof window.localStorage.setItem === 'function'
  );
}

function isSessionViewMode(value: unknown): value is SessionViewMode {
  return value === 'pos' || value === 'form';
}

export function recordUpdateSessionViewStorageKey() {
  return 'banji:record-update:view:v1';
}

export function readRecordUpdateSessionViewMode(): SessionViewMode {
  if (!canUseBrowserStorage()) {
    return DEFAULT_SESSION_VIEW_MODE;
  }
  const value = window.localStorage.getItem(recordUpdateSessionViewStorageKey());
  return isSessionViewMode(value) ? value : DEFAULT_SESSION_VIEW_MODE;
}

export function writeRecordUpdateSessionViewMode(mode: SessionViewMode) {
  if (!canUseBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(recordUpdateSessionViewStorageKey(), mode);
}
