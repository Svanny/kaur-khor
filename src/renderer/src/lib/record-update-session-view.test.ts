import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION_VIEW_MODE,
  readRecordUpdateSessionViewMode,
  recordUpdateSessionViewStorageKey,
  writeRecordUpdateSessionViewMode,
} from './record-update-session-view';

describe('record update session view storage', () => {
  afterEach(() => {
    delete (window as typeof window & { __KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__?: boolean }).__KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__;
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

  it('ignores stored form mode and localStorage setItem failures', () => {
    const storage = {
      getItem: vi.fn(() => 'form'),
      setItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);

    expect(readRecordUpdateSessionViewMode()).toBe(DEFAULT_SESSION_VIEW_MODE);
    expect(() => writeRecordUpdateSessionViewMode('pos')).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledWith(recordUpdateSessionViewStorageKey(), 'pos');
  });

  it('coerces requested form mode to the POS default', () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);

    writeRecordUpdateSessionViewMode('form');

    expect(storage.setItem).toHaveBeenCalledWith(recordUpdateSessionViewStorageKey(), DEFAULT_SESSION_VIEW_MODE);
  });

  it('keeps the dead form view inaccessible without the test-only override', () => {
    const storage = {
      getItem: vi.fn(() => 'form'),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);

    expect(readRecordUpdateSessionViewMode()).toBe(DEFAULT_SESSION_VIEW_MODE);
  });

  it('allows dormant form view coverage only through the test override', () => {
    const storage = {
      getItem: vi.fn(() => 'form'),
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);
    (window as typeof window & { __KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__?: boolean }).__KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__ = true;

    expect(readRecordUpdateSessionViewMode()).toBe('form');
  });
});
