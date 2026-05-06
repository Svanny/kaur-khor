import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION_VIEW_MODE,
  readRecordUpdateSessionViewMode,
  recordUpdateSessionViewStorageKey,
  writeRecordUpdateSessionViewMode,
} from './record-update-session-view';

describe('record update session view storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the default view when localStorage access is blocked', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(readRecordUpdateSessionViewMode()).toBe(DEFAULT_SESSION_VIEW_MODE);
    expect(() => writeRecordUpdateSessionViewMode('form')).not.toThrow();
  });

  it('falls back to the default view when localStorage getItem throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);

    expect(readRecordUpdateSessionViewMode()).toBe(DEFAULT_SESSION_VIEW_MODE);
  });

  it('ignores localStorage setItem failures', () => {
    const storage = {
      getItem: vi.fn(() => 'form'),
      setItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);

    expect(readRecordUpdateSessionViewMode()).toBe('form');
    expect(() => writeRecordUpdateSessionViewMode('pos')).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledWith(recordUpdateSessionViewStorageKey(), 'pos');
  });
});
