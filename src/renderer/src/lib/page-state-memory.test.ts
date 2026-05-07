import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildRememberedAutomationHref,
  buildRememberedCatalogHref,
  buildRememberedHistoryHref,
  buildRememberedInsightsHref,
  buildRememberedInboxHref,
  buildRememberedOverviewHref,
  buildRememberedPerformanceHref,
  buildRememberedPageHref,
  buildRememberedSettingsHref,
  PAGE_STATE_MEMORY_STORAGE_KEY,
  readRememberedPageValue,
  rememberPageState,
  writeRememberedPageValue,
} from './page-state-memory';

describe('page-state-memory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('remembers canonical page state across reload-safe local storage', () => {
    rememberPageState('/insights', '?range=7d&scope=skus&compare=0&extra=drop');

    expect(buildRememberedInsightsHref()).toBe('/insights');
    expect(buildRememberedInsightsHref({ performance: { range: '90d' } })).toBe('/insights/pressure?range=90d&scope=skus');

    rememberPageState('/insights/pressure', '?range=7d&scope=skus&compare=0&extra=drop');

    expect(buildRememberedPerformanceHref()).toBe('/insights/pressure?range=7d&scope=skus');
  });

  test('ignores malformed storage and invalid route params', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, '{not valid json');

    expect(buildRememberedCatalogHref()).toBe('/catalog');

    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      performance: '?range=bad&scope=nope&extra=drop',
      settings: '/not-settings',
    }));

    expect(buildRememberedPerformanceHref()).toBe('/insights/pressure');
    expect(buildRememberedSettingsHref()).toBe('/settings');

    rememberPageState('/insights', '?range=bad&scope=nope&compare=maybe');

    expect(buildRememberedPerformanceHref()).toBe('/insights/pressure');
    expect(JSON.parse(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY) ?? '{}')).not.toHaveProperty('insights');
  });

  test('clears remembered page state when the canonical state returns to defaults', () => {
    rememberPageState('/catalog', '?q=scarf&supplier=Mekong%20Looms&view=skus');
    expect(buildRememberedCatalogHref()).toBe('/catalog?q=scarf&supplier=Mekong+Looms&view=skus');

    rememberPageState('/catalog', '');

    expect(buildRememberedCatalogHref()).toBe('/catalog');
    expect(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY)).toBeNull();
  });

  test('ignores blocked localStorage access while reading and writing page state', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(buildRememberedCatalogHref()).toBe('/catalog');
    expect(() => rememberPageState('/catalog', '?q=scarf&view=skus')).not.toThrow();
    expect(
      readRememberedPageValue('catalog', 'density', 'comfortable', (value) =>
        value === 'compact' || value === 'comfortable' ? value : null,
      ),
    ).toBe('comfortable');
    expect(() =>
      writeRememberedPageValue('catalog', 'density', 'compact', (value) =>
        value === 'compact' || value === 'comfortable' ? value : null,
      ),
    ).not.toThrow();
  });

  test('ignores set and remove failures while writing page state', () => {
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    } as unknown as Storage;

    expect(() => rememberPageState('/catalog', '?q=scarf&view=skus', storage)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalled();

    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ catalog: '?q=scarf&view=skus' }));
    vi.mocked(storage.removeItem).mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => rememberPageState('/catalog', '', storage)).not.toThrow();
    expect(storage.removeItem).toHaveBeenCalledWith(PAGE_STATE_MEMORY_STORAGE_KEY);
  });

  test('does not remember automation section as a catalog destination', () => {
    rememberPageState('/catalog', '?section=automation&exposure=hidden');
    expect(buildRememberedCatalogHref()).toBe('/catalog');
  });

  test('excludes transient overview and automation selections', () => {
    rememberPageState(
      '/work/queue',
      '?workflow=customer&customerFilter=review&customerTask=automation:intake:intake-7&task=sku-1&taskMode=goods_received&filter=ready_to_receive',
    );
    rememberPageState(
      '/work/intake',
      '?section=intake&filter=needs_review&conversation=conv-1&intake=intake-1&ticket=ticket-1&q=telegram',
    );

    expect(buildRememberedOverviewHref()).toBe('/work/queue?filter=ready_to_receive&customerFilter=review');
    expect(buildRememberedInboxHref()).toBe('/work/queue?filter=ready_to_receive&customerFilter=review');
    expect(buildRememberedPageHref('/work')).toBe('/work');
    expect(buildRememberedPageHref('/work/queue')).toBe('/work/queue?filter=ready_to_receive&customerFilter=review');
    expect(buildRememberedAutomationHref()).toBe('/work/intake?section=intake');
  });

  test('migrates old remembered page state into canonical intent routes on read', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      overview: '?workflow=customer&customerFilter=quoted&customerTask=drop-me',
      operations: '?scope=skus&view=all',
      performance: '?range=7d&scope=skus',
    }));

    expect(buildRememberedInboxHref()).toBe('/work/queue?customerFilter=quoted');
    expect(buildRememberedHistoryHref()).toBe('/settings/history');
    expect(buildRememberedInsightsHref()).toBe('/insights');
  });

  test('remembers settings subsections without temporary dialog state', () => {
    rememberPageState('/settings/interface', '?dialog=danger');

    expect(buildRememberedSettingsHref()).toBe('/settings/interface');

    rememberPageState('/settings/workspace', '');

    expect(buildRememberedSettingsHref()).toBe('/settings');
  });

  test('stores typed non-url page values without losing remembered route state', () => {
    rememberPageState('/catalog', '?q=scarf&view=skus');
    writeRememberedPageValue('catalog', 'density', 'compact', (value) =>
      value === 'compact' || value === 'comfortable' ? value : null,
    );

    expect(buildRememberedCatalogHref()).toBe('/catalog?q=scarf&view=skus');
    expect(
      readRememberedPageValue('catalog', 'density', 'comfortable', (value) =>
        value === 'compact' || value === 'comfortable' ? value : null,
      ),
    ).toBe('compact');
  });

  test('ignores invalid typed values and keeps page buckets isolated', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: {
        values: {
          density: 'wide',
          'sku:sku-1:chartLayout': { timeframe: '1Y' },
        },
      },
      history: {
        values: {
          density: 'compact',
        },
      },
    }));

    expect(
      readRememberedPageValue('catalog', 'density', 'comfortable', (value) =>
        value === 'compact' || value === 'comfortable' ? value : null,
      ),
    ).toBe('comfortable');
    expect(
      readRememberedPageValue('history', 'density', 'comfortable', (value) =>
        value === 'compact' || value === 'comfortable' ? value : null,
      ),
    ).toBe('compact');
  });

  test('scopes detail values by entity without leaking across entities', () => {
    writeRememberedPageValue('catalog', 'chartLayout', 'expanded', (value) =>
      value === 'expanded' || value === 'default' ? value : null,
      { scope: 'sku:sku-1' },
    );

    expect(
      readRememberedPageValue('catalog', 'chartLayout', 'default', (value) =>
        value === 'expanded' || value === 'default' ? value : null,
        { scope: 'sku:sku-1' },
      ),
    ).toBe('expanded');
    expect(
      readRememberedPageValue('catalog', 'chartLayout', 'default', (value) =>
        value === 'expanded' || value === 'default' ? value : null,
        { scope: 'sku:sku-2' },
      ),
    ).toBe('default');
  });
});
