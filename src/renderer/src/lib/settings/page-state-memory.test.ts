import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildRememberedAutomationHref,
  buildRememberedArchiveHref,
  buildRememberedCatalogHref,
  buildRememberedHistoryHref,
  buildRememberedInsightsHref,
  buildRememberedInboxHref,
  buildRememberedInventoryHref,
  buildRememberedOverviewHref,
  buildRememberedPerformanceHref,
  buildRememberedPageHref,
  buildRememberedSettingsHref,
  PAGE_STATE_MEMORY_STORAGE_KEY,
  readRememberedPageValue,
  rememberPageState,
  writeRememberedPageValue,
} from '../settings/page-state-memory';
import { readInsightsRouteState } from '../navigation/navigation-state';

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
    const inventoryNinetyDayState = readInsightsRouteState(new URLSearchParams('mode=inventory&range=90d'));
    expect(buildRememberedInsightsHref({ inventory: inventoryNinetyDayState.inventory })).toBe('/insights/inventory?range=90d');

    rememberPageState('/insights/pressure', '?range=7d&scope=skus&compare=0&extra=drop');

    expect(buildRememberedInventoryHref()).toBe('/insights/inventory?range=7d');
    expect(buildRememberedPerformanceHref()).toBe('/insights/inventory?range=7d');
  });

  test('ignores malformed storage and invalid route params', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, '{not valid json');

    expect(buildRememberedCatalogHref()).toBe('/catalog');

    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      performance: '?range=bad&scope=nope&extra=drop',
      settings: '/not-settings',
    }));

    expect(buildRememberedPerformanceHref()).toBe('/insights/inventory');
    expect(buildRememberedSettingsHref()).toBe('/settings');

    rememberPageState('/insights', '?range=bad&scope=nope&compare=maybe');

    expect(buildRememberedPerformanceHref()).toBe('/insights/inventory');
    expect(JSON.parse(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY) ?? '{}')).not.toHaveProperty('insights');
  });

  test('ignores corrupted object routes without dropping valid typed values', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: {
        route: 42,
        values: {
          density: 'compact',
        },
      },
      settings: {
        route: 42,
      },
    }));

    expect(buildRememberedSettingsHref()).toBe('/settings');
    expect(buildRememberedCatalogHref()).toBe('/catalog');
    expect(
      readRememberedPageValue('catalog', 'density', 'comfortable', (value) =>
        value === 'compact' || value === 'comfortable' ? value : null,
      ),
    ).toBe('compact');
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

  test('keeps archived catalog filters out of the active products destination', () => {
    rememberPageState('/catalog', '?q=scarf&supplier=Mekong%20Looms&view=skus');
    rememberPageState('/catalog', '?status=archived&q=retired&view=services');

    expect(buildRememberedCatalogHref()).toBe('/catalog?q=scarf&supplier=Mekong+Looms&view=skus');
    expect(buildRememberedArchiveHref()).toBe('/catalog?q=retired&status=archived&view=services');
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

    expect(buildRememberedOverviewHref()).toBe('/work/queue?filter=ready_to_receive&workflow=customer&customerFilter=review');
    expect(buildRememberedInboxHref()).toBe('/work/queue?filter=ready_to_receive&workflow=customer&customerFilter=review');
    expect(buildRememberedPageHref('/work')).toBe('/work');
    expect(buildRememberedPageHref('/work/queue')).toBe('/work/queue?filter=ready_to_receive&workflow=customer&customerFilter=review');
    expect(buildRememberedAutomationHref()).toBe('/work/intake?section=intake&filter=needs_review&q=telegram');
  });

  test('remembers automation filters without persisting transient drawer selections', () => {
    rememberPageState(
      '/work/intake',
      '?section=exceptions&filter=needs_review&q=telegram&conversation=conv-1&intake=intake-1&ticket=ticket-1',
    );

    expect(buildRememberedAutomationHref()).toBe('/work/intake?section=intake&filter=needs_review&q=telegram');
  });

  test('migrates old remembered page state into canonical intent routes on read', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      overview: '?workflow=customer&customerFilter=quoted&customerTask=drop-me',
      operations: '?scope=skus&view=all',
      performance: '?range=7d&scope=skus',
    }));

    expect(buildRememberedInboxHref()).toBe('/work/queue?workflow=customer&customerFilter=quoted');
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

  test('ignores typed page values when the validator rejects persisted or outgoing values', () => {
    const rejectingValidator = (value: unknown) => {
      if (value !== 'compact' && value !== 'comfortable') {
        throw new Error('invalid density');
      }
      return value;
    };
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: {
        values: {
          density: 'wide',
        },
      },
    }));

    expect(
      readRememberedPageValue('catalog', 'density', 'comfortable', rejectingValidator),
    ).toBe('comfortable');
    expect(() =>
      writeRememberedPageValue('catalog', 'density', 'wide' as 'compact', rejectingValidator),
    ).not.toThrow();
    expect(
      readRememberedPageValue('catalog', 'density', 'comfortable', rejectingValidator),
    ).toBe('comfortable');
  });

  test('drops unknown buckets from corrupted page memory before rewriting storage', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: '?q=scarf&view=skus',
      staleFuturePage: {
        route: '?bad=1',
        values: {
          density: 'compact',
        },
      },
    }));

    writeRememberedPageValue('catalog', 'density', 'compact', (value) =>
      value === 'compact' || value === 'comfortable' ? value : null,
    );

    const persisted = JSON.parse(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY) ?? '{}');
    expect(persisted).toHaveProperty('catalog');
    expect(persisted).not.toHaveProperty('staleFuturePage');
  });

  test('bounds corrupted typed value records before preserving them on write', () => {
    const values = Object.fromEntries(
      Array.from({ length: 160 }, (_, index) => [`value-${index}`, index]),
    );
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: {
        route: '?q=scarf&view=skus',
        values: {
          ...values,
          '': 'drop-empty-key',
          ['x'.repeat(257)]: 'drop-long-key',
        },
      },
    }));

    writeRememberedPageValue('catalog', 'density', 'compact', (value) =>
      value === 'compact' || value === 'comfortable' ? value : null,
    );

    const persisted = JSON.parse(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY) ?? '{}');
    expect(Object.keys(persisted.catalog.values)).toHaveLength(129);
    expect(persisted.catalog.values).toMatchObject({
      'value-0': 0,
      'value-127': 127,
      density: 'compact',
    });
    expect(persisted.catalog.values).not.toHaveProperty('value-128');
    expect(Object.prototype.hasOwnProperty.call(persisted.catalog.values, '')).toBe(false);
    expect(persisted.catalog.values).not.toHaveProperty('x'.repeat(257));
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

  test('uses structured scoped value keys without breaking legacy scoped values', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: {
        values: {
          'sku:legacy-sku:chartLayout': 'legacy-expanded',
          'sku:sku-1:chartLayout': 'legacy-colliding-scope',
          'sku:sku-1:chartLayout:chartLayout': 'legacy-colliding-key',
        },
      },
    }));

    expect(
      readRememberedPageValue('catalog', 'chartLayout', 'default', (value) =>
        value === 'legacy-expanded' || value === 'expanded' || value === 'default' ? value : null,
        { scope: 'sku:legacy-sku' },
      ),
    ).toBe('legacy-expanded');

    writeRememberedPageValue('catalog', 'chartLayout', 'expanded', (value) =>
      value === 'legacy-colliding-scope' || value === 'expanded' || value === 'default' ? value : null,
      { scope: 'sku:sku-1' },
    );

    writeRememberedPageValue('catalog', 'chartLayout:chartLayout', 'expanded', (value) =>
      value === 'legacy-colliding-key' || value === 'expanded' || value === 'default' ? value : null,
      { scope: 'sku:sku-1' },
    );

    const persisted = JSON.parse(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY) ?? '{}');
    expect(persisted.catalog.values).toMatchObject({
      '$scoped:["sku:sku-1","chartLayout"]': 'expanded',
      '$scoped:["sku:sku-1","chartLayout:chartLayout"]': 'expanded',
      'sku:legacy-sku:chartLayout': 'legacy-expanded',
    });
    expect(persisted.catalog.values).not.toHaveProperty('sku:sku-1:chartLayout');
    expect(persisted.catalog.values).not.toHaveProperty('sku:sku-1:chartLayout:chartLayout');
  });
});
