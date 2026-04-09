import { describe, expect, test } from 'vitest';
import {
  buildAnalysisHref,
  buildOverviewHref,
  buildPerformanceHref,
  buildSkuDetailHref,
  readOverviewRouteState,
  readPerformanceRouteState,
  readServiceAction,
  readSkuAction,
} from './navigation-state';

describe('navigation-state', () => {
  test('falls back to defaults for invalid overview params', () => {
    const state = readOverviewRouteState(
      new URLSearchParams('scope=invalid&filter=nope&task=sku-1&taskMode=bad'),
    );

    expect(state).toEqual({
      filter: 'all',
      scope: 'all',
      taskId: 'sku-1',
      taskMode: 'not_ordered',
    });
  });

  test('builds canonical deep links for overview and analysis state', () => {
    expect(
      buildOverviewHref({
        filter: 'ready_to_receive',
        scope: 'services',
        taskId: 'sku-1',
        taskMode: 'goods_received',
      }),
    ).toBe('/?filter=ready_to_receive&scope=services&task=sku-1&taskMode=goods_received');

    expect(buildAnalysisHref({ section: 'pressure', timeframe: '1Y' })).toBe('/analysis?section=pressure&timeframe=1Y');
  });

  test('reads performance compare mode safely and omits default compare state', () => {
    expect(readPerformanceRouteState(new URLSearchParams('compare=0&range=7d&scope=skus'))).toEqual({
      compare: false,
      range: '7d',
      scope: 'skus',
    });

    expect(buildPerformanceHref({ compare: true, range: '30d', scope: 'all' })).toBe('/performance');
    expect(buildPerformanceHref({ compare: false, range: '7d' })).toBe('/performance?compare=0&range=7d');
  });

  test('reads entity action params only when valid', () => {
    expect(readSkuAction(new URLSearchParams('action=stock'))).toBe('stock');
    expect(readSkuAction(new URLSearchParams('action=invalid'))).toBeNull();
    expect(readServiceAction(new URLSearchParams('action=price'))).toBe('price');
    expect(readServiceAction(new URLSearchParams('action=order'))).toBeNull();
    expect(buildSkuDetailHref('sku-1', 'receipt')).toBe('/catalog/skus/sku-1?action=receipt');
  });
});
