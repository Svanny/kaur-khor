import { describe, expect, test } from 'vitest';
import {
  buildAnalysisHref,
  buildAutomationHref,
  buildFinancialsHref,
  buildOverviewHref,
  buildPerformanceHref,
  buildSkuDetailHref,
  readAnalysisRouteState,
  readAutomationRouteState,
  readFinancialsRouteState,
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
      supplier: null,
      taskId: 'sku-1',
      taskMode: 'not_ordered',
      workflow: 'supplier',
      customerFilter: 'all',
      customerTaskId: null,
    });
  });

  test('builds canonical deep links for overview and analysis state', () => {
    expect(
      buildOverviewHref({
        filter: 'ready_to_receive',
        scope: 'services',
        taskId: 'sku-1',
        taskMode: 'goods_received',
        workflow: 'customer',
        customerFilter: 'quoted',
        customerTaskId: 'automation:intake:intake-1',
      }),
    ).toBe('/?filter=ready_to_receive&scope=services&task=sku-1&taskMode=goods_received&workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1');

    expect(buildAnalysisHref({ section: 'pressure', timeframe: '1Y', supplier: 'Mekong Looms' })).toBe(
      '/analysis?section=pressure&supplier=Mekong+Looms&timeframe=1Y',
    );
  });

  test('reads analysis supplier filter safely', () => {
    expect(readAnalysisRouteState(new URLSearchParams('scope=services&supplier=Mekong%20Looms'))).toEqual({
      chart: null,
      scope: 'services',
      section: 'workbench',
      supplier: 'Mekong Looms',
      timeframe: 'Recent',
    });
  });

  test('preserves expanded analysis chart state in route params', () => {
    expect(readAnalysisRouteState(new URLSearchParams('chart=expanded&section=pressure'))).toEqual({
      chart: 'expanded',
      scope: 'all',
      section: 'pressure',
      supplier: null,
      timeframe: 'Recent',
    });

    expect(buildAnalysisHref({ chart: 'expanded', section: 'workbench', timeframe: 'Recent' })).toBe(
      '/analysis?chart=expanded',
    );
  });

  test('reads performance compare mode safely and omits default compare state', () => {
    expect(readPerformanceRouteState(new URLSearchParams('compare=0&range=7d&scope=skus'))).toEqual({
      compare: false,
      range: '7d',
      scope: 'skus',
      supplier: null,
    });

    expect(buildPerformanceHref({ compare: false, range: '30d', scope: 'all' })).toBe('/performance');
    expect(buildPerformanceHref({ compare: true, range: '7d' })).toBe('/performance?compare=1&range=7d');
  });

  test('reads financials route state safely and omits default financials params', () => {
    expect(readFinancialsRouteState(new URLSearchParams('compare=false&range=90d&scope=services&supplier=Salon%20Tools'))).toEqual({
      compare: false,
      range: '90d',
      scope: 'services',
      supplier: 'Salon Tools',
    });

    expect(readFinancialsRouteState(new URLSearchParams('compare=maybe&range=bad&scope=nope'))).toEqual({
      compare: false,
      range: '1d',
      scope: 'all',
      supplier: null,
    });

    expect(buildFinancialsHref({ compare: false, range: '1d', scope: 'all' })).toBe('/financials');
    expect(buildFinancialsHref({ compare: true, range: '7d', scope: 'skus' })).toBe(
      '/financials?compare=1&range=7d&scope=skus',
    );
  });

  test('reads automation route state safely and omits default params', () => {
    expect(readAutomationRouteState(new URLSearchParams('section=intake&filter=needs_review&conversation=conv_1&intake=intake_1'))).toEqual({
      channel: 'telegram',
      section: 'intake',
      exposure: 'all',
      intakeFilter: 'needs_review',
      health: 'all',
      q: null,
      conversationId: 'conv_1',
      intakeId: 'intake_1',
      ticketId: null,
    });

    expect(readAutomationRouteState(new URLSearchParams('section=bad&filter=oops&health=nope&q=%20%20'))).toEqual({
      channel: 'telegram',
      section: 'overview',
      exposure: 'all',
      intakeFilter: 'all',
      health: 'all',
      q: null,
      conversationId: null,
      intakeId: null,
      ticketId: null,
    });

    expect(buildAutomationHref({ section: 'catalog', exposure: 'hidden' })).toBe('/automations?section=catalog&exposure=hidden');
    expect(buildAutomationHref({ section: 'intake', intakeFilter: 'needs_review', conversationId: 'conv_1', intakeId: 'intake_1' })).toBe(
      '/automations?section=intake&filter=needs_review&conversation=conv_1&intake=intake_1',
    );
  });

  test('reads entity action params only when valid', () => {
    expect(readSkuAction(new URLSearchParams('action=stock'))).toBe('stock');
    expect(readSkuAction(new URLSearchParams('action=invalid'))).toBeNull();
    expect(readServiceAction(new URLSearchParams('action=price'))).toBe('price');
    expect(readServiceAction(new URLSearchParams('action=order'))).toBeNull();
    expect(buildSkuDetailHref('sku-1')).toBe('/catalog/skus/sku-1');
  });

  test('round-trips overview customer workflow params safely', () => {
    expect(readOverviewRouteState(new URLSearchParams('workflow=customer&customerFilter=review&customerTask=automation:intake:intake-7'))).toEqual({
      filter: 'all',
      scope: 'all',
      supplier: null,
      taskId: null,
      taskMode: null,
      workflow: 'customer',
      customerFilter: 'review',
      customerTaskId: 'automation:intake:intake-7',
    });

    expect(buildOverviewHref({
      workflow: 'customer',
      customerFilter: 'open',
      customerTaskId: 'automation:intake:intake-9',
    })).toBe('/?workflow=customer&customerFilter=open&customerTask=automation%3Aintake%3Aintake-9');
  });
});
