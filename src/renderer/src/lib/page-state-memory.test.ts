import { beforeEach, describe, expect, test } from 'vitest';
import {
  buildRememberedAutomationHref,
  buildRememberedCatalogHref,
  buildRememberedOverviewHref,
  buildRememberedPerformanceHref,
  buildRememberedSettingsHref,
  PAGE_STATE_MEMORY_STORAGE_KEY,
  rememberPageState,
} from './page-state-memory';

describe('page-state-memory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('remembers canonical page state across reload-safe local storage', () => {
    rememberPageState('/performance', '?range=7d&scope=skus&compare=0&extra=drop');

    expect(buildRememberedPerformanceHref()).toBe('/performance?range=7d&scope=skus');
    expect(buildRememberedPerformanceHref({ range: '90d' })).toBe('/performance?range=90d&scope=skus');
  });

  test('ignores malformed storage and invalid route params', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, '{not valid json');

    expect(buildRememberedCatalogHref()).toBe('/catalog');

    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      performance: '?range=bad&scope=nope&extra=drop',
      settings: '/not-settings',
    }));

    expect(buildRememberedPerformanceHref()).toBe('/performance');
    expect(buildRememberedSettingsHref()).toBe('/settings');

    rememberPageState('/performance', '?range=bad&scope=nope&compare=maybe');

    expect(buildRememberedPerformanceHref()).toBe('/performance');
    expect(JSON.parse(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY) ?? '{}')).not.toHaveProperty('performance');
  });

  test('clears remembered page state when the canonical state returns to defaults', () => {
    rememberPageState('/catalog', '?q=scarf&supplier=Mekong%20Looms&view=skus');
    expect(buildRememberedCatalogHref()).toBe('/catalog?q=scarf&supplier=Mekong+Looms&view=skus');

    rememberPageState('/catalog', '');

    expect(buildRememberedCatalogHref()).toBe('/catalog');
    expect(window.localStorage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY)).toBeNull();
  });

  test('excludes transient overview and automation selections', () => {
    rememberPageState(
      '/',
      '?workflow=customer&customerFilter=review&customerTask=automation:intake:intake-7&task=sku-1&taskMode=goods_received&filter=ready_to_receive',
    );
    rememberPageState(
      '/automations',
      '?section=intake&filter=needs_review&conversation=conv-1&intake=intake-1&ticket=ticket-1&q=telegram',
    );

    expect(buildRememberedOverviewHref()).toBe('/?filter=ready_to_receive&workflow=customer&customerFilter=review');
    expect(buildRememberedAutomationHref()).toBe('/automations?section=intake&filter=needs_review&q=telegram');
  });

  test('remembers settings subsections without temporary dialog state', () => {
    rememberPageState('/settings/interface', '?dialog=danger');

    expect(buildRememberedSettingsHref()).toBe('/settings/interface');

    rememberPageState('/settings/workspace', '');

    expect(buildRememberedSettingsHref()).toBe('/settings');
  });
});
