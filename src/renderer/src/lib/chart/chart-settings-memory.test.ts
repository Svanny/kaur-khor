import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readEntityChartSettings,
  readSubtypeDefaultChartSettings,
  writeEntityChartSettings,
  writeSubtypeDefaultChartSettings,
} from './chart-settings-memory';

type TestChartSettings = {
  visible: boolean;
};

function normalizeSettings(value: TestChartSettings): TestChartSettings {
  return {
    visible: Boolean(value.visible),
  };
}

describe('chart settings memory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips entity and subtype settings through storage', () => {
    const subtypeDefaults = { visible: true };
    const entityOverride = { visible: false };

    writeSubtypeDefaultChartSettings('sku', subtypeDefaults, normalizeSettings);
    writeEntityChartSettings('sku', 'sku-1', entityOverride, normalizeSettings);

    expect(readSubtypeDefaultChartSettings('sku', normalizeSettings)).toEqual(subtypeDefaults);
    expect(readEntityChartSettings('sku', 'sku-1', normalizeSettings)).toEqual(entityOverride);
  });

  it('falls back when localStorage access is blocked', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(readSubtypeDefaultChartSettings('sku', normalizeSettings)).toBeNull();
    expect(readEntityChartSettings('sku', 'sku-1', normalizeSettings)).toBeNull();
    expect(() => writeSubtypeDefaultChartSettings('sku', { visible: true }, normalizeSettings)).not.toThrow();
    expect(() => writeEntityChartSettings('sku', 'sku-1', { visible: true }, normalizeSettings)).not.toThrow();
  });

  it('ignores localStorage getItem and setItem failures', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    } as unknown as Storage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);

    expect(readSubtypeDefaultChartSettings('sku', normalizeSettings)).toBeNull();
    expect(() => writeSubtypeDefaultChartSettings('sku', { visible: true }, normalizeSettings)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('ignores malformed persisted subtype settings records', () => {
    window.localStorage.setItem('kaur-khor:chart-settings:defaults:v1', JSON.stringify('not-a-record'));

    expect(readSubtypeDefaultChartSettings('sku', normalizeSettings)).toBeNull();
    expect(() => writeSubtypeDefaultChartSettings('sku', { visible: true }, normalizeSettings)).not.toThrow();
    expect(readSubtypeDefaultChartSettings('sku', normalizeSettings)).toEqual({ visible: true });
  });

  it('ignores corrupted subtype and entity setting roots before normalization', () => {
    window.localStorage.setItem('kaur-khor:chart-settings:defaults:v1', JSON.stringify({
      sku: 'not-settings',
    }));
    window.localStorage.setItem('kaur-khor:page-state-memory:v1', JSON.stringify({
      catalog: {
        values: {
          'sku:sku-1:chartSettings': 'not-settings',
        },
      },
    }));

    expect(readSubtypeDefaultChartSettings('sku', normalizeSettings)).toBeNull();
    expect(readEntityChartSettings('sku', 'sku-1', normalizeSettings)).toBeNull();
  });

  it('ignores settings when the normalizer rejects persisted or outgoing values', () => {
    const rejectingNormalize = (value: TestChartSettings): TestChartSettings => {
      if (typeof value.visible !== 'boolean') {
        throw new Error('invalid setting');
      }
      return value;
    };
    window.localStorage.setItem('kaur-khor:chart-settings:defaults:v1', JSON.stringify({
      sku: { visible: 'dirty' },
    }));
    window.localStorage.setItem('kaur-khor:page-state-memory:v1', JSON.stringify({
      catalog: {
        values: {
          'sku:sku-1:chartSettings': { visible: 'dirty' },
        },
      },
    }));

    expect(readSubtypeDefaultChartSettings('sku', rejectingNormalize)).toBeNull();
    expect(readEntityChartSettings('sku', 'sku-1', rejectingNormalize)).toBeNull();
    expect(() =>
      writeSubtypeDefaultChartSettings('sku', { visible: 'dirty' } as unknown as TestChartSettings, rejectingNormalize),
    ).not.toThrow();
    expect(readSubtypeDefaultChartSettings('sku', rejectingNormalize)).toBeNull();
  });
});
