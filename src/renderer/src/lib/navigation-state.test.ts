import { describe, expect, test } from 'vitest';
import {
  buildAnalysisHref,
  buildAutomationHref,
  buildCaptureHref,
  buildFinancialsHref,
  buildWorkHref,
  buildPerformanceHref,
  buildSkuDetailHref,
  readCatalogRouteState,
  readAnalysisRouteState,
  readAutomationRouteState,
  readFinancialsRouteState,
  readInsightsRouteState,
  readWorkRouteState,
  readPerformanceRouteState,
  readServiceAction,
  readSkuAction,
} from './navigation-state';

describe('navigation-state', () => {
  test('falls back to defaults for invalid work params', () => {
    const state = readWorkRouteState(
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
      section: 'queue',
    });
  });

  test('builds canonical deep links for work and analysis state', () => {
    expect(
      buildWorkHref({
        filter: 'ready_to_receive',
        scope: 'services',
        taskId: 'sku-1',
        taskMode: 'goods_received',
        workflow: 'customer',
        customerFilter: 'quoted',
        customerTaskId: 'automation:intake:intake-1',
      }),
    ).toBe('/work/queue?filter=ready_to_receive&scope=services&task=sku-1&taskMode=goods_received&workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1');

    expect(buildAnalysisHref({ section: 'pressure', timeframe: '1Y', supplier: 'Mekong Looms' })).toBe(
      '/insights/explain?section=pressure&supplier=Mekong+Looms&timeframe=1Y',
    );
  });

  test('builds canonical capture lane hrefs', () => {
    expect(buildCaptureHref()).toBe('/work/capture');
    expect(buildCaptureHref({ lane: 'stock-count' })).toBe('/work/capture/stock-count');
    expect(buildCaptureHref({ lane: 'customer-order' }, new URLSearchParams('ticketMode=edit'))).toBe('/work/capture/customer-order?ticketMode=edit');
  });

  test('reads canonical catalog and insights state safely', () => {
    expect(readCatalogRouteState(new URLSearchParams('status=archived&section=automation'))).toEqual({
      q: null,
      section: 'automation',
      status: 'archived',
      supplier: null,
      view: 'all',
    });
    expect(readInsightsRouteState(new URLSearchParams('mode=financials&compare=1&range=90d&scope=services'))).toMatchObject({
      mode: 'financials',
      financials: {
        compare: true,
        range: '90d',
        scope: 'services',
      },
    });
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
      '/insights/explain?chart=expanded',
    );
  });

  test('reads performance compare mode safely and omits default compare state', () => {
    expect(readPerformanceRouteState(new URLSearchParams('compare=0&range=7d&scope=skus'))).toEqual({
      compare: false,
      range: '7d',
      scope: 'skus',
      supplier: null,
      customRangeStart: null,
      customRangeEnd: null,
    });

    expect(buildPerformanceHref({ compare: false, range: '30d', scope: 'all' })).toBe('/insights/pressure');
    expect(buildPerformanceHref({ compare: true, range: '7d' })).toBe('/insights/pressure?compare=1&range=7d');
  });

  test('round-trips performance custom range params safely', () => {
    expect(readPerformanceRouteState(new URLSearchParams('range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z'))).toEqual({
      compare: false,
      range: 'custom',
      scope: 'all',
      supplier: null,
      customRangeStart: '2026-01-01T00:00:00.000Z',
      customRangeEnd: '2026-01-15T23:59:59.999Z',
    });

    expect(buildPerformanceHref({
      range: 'custom',
      customRangeStart: '2026-01-01T00:00:00.000Z',
      customRangeEnd: '2026-01-15T23:59:59.999Z',
    })).toBe('/insights/pressure?range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z');
  });

  test('reads financials route state safely and omits default financials params', () => {
    expect(readFinancialsRouteState(new URLSearchParams('compare=false&range=90d&scope=services&supplier=Salon%20Tools'))).toEqual({
      compare: false,
      range: '90d',
      scope: 'services',
      supplier: 'Salon Tools',
      customRangeStart: null,
      customRangeEnd: null,
    });

    expect(readFinancialsRouteState(new URLSearchParams('compare=maybe&range=bad&scope=nope'))).toEqual({
      compare: false,
      range: '1d',
      scope: 'all',
      supplier: null,
      customRangeStart: null,
      customRangeEnd: null,
    });

    expect(buildFinancialsHref({ compare: false, range: '1d', scope: 'all' })).toBe('/insights/money');
    expect(buildFinancialsHref({ compare: true, range: '7d', scope: 'skus' })).toBe(
      '/insights/money?compare=1&range=7d&scope=skus',
    );
  });

  test('round-trips financials custom range params safely', () => {
    expect(readFinancialsRouteState(new URLSearchParams('range=custom&customStart=2026-02-01T00%3A00%3A00.000Z&customEnd=2026-02-10T23%3A59%3A59.999Z'))).toEqual({
      compare: false,
      range: 'custom',
      scope: 'all',
      supplier: null,
      customRangeStart: '2026-02-01T00:00:00.000Z',
      customRangeEnd: '2026-02-10T23:59:59.999Z',
    });

    expect(buildFinancialsHref({
      range: 'custom',
      customRangeStart: '2026-02-01T00:00:00.000Z',
      customRangeEnd: '2026-02-10T23:59:59.999Z',
    })).toBe('/insights/money?range=custom&customStart=2026-02-01T00%3A00%3A00.000Z&customEnd=2026-02-10T23%3A59%3A59.999Z');
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

    expect(buildAutomationHref({ section: 'catalog', exposure: 'hidden' })).toBe('/catalog?section=automation&exposure=hidden');
    expect(buildAutomationHref({ section: 'intake', intakeFilter: 'needs_review', conversationId: 'conv_1', intakeId: 'intake_1' })).toBe(
      '/work/intake?section=intake&filter=needs_review&conversation=conv_1&intake=intake_1',
    );
  });

  test('reads entity action params only when valid', () => {
    expect(readSkuAction(new URLSearchParams('action=stock'))).toBe('stock');
    expect(readSkuAction(new URLSearchParams('action=invalid'))).toBeNull();
    expect(readServiceAction(new URLSearchParams('action=price'))).toBe('price');
    expect(readServiceAction(new URLSearchParams('action=order'))).toBeNull();
    expect(buildSkuDetailHref('sku-1')).toBe('/catalog/skus/sku-1');
  });

  test('round-trips work customer workflow params safely', () => {
    expect(readWorkRouteState(new URLSearchParams('workflow=customer&customerFilter=review&customerTask=automation:intake:intake-7'))).toEqual({
      filter: 'all',
      scope: 'all',
      supplier: null,
      taskId: null,
      taskMode: null,
      workflow: 'customer',
      customerFilter: 'review',
      customerTaskId: 'automation:intake:intake-7',
      section: 'queue',
    });

    expect(buildWorkHref({
      workflow: 'customer',
      customerFilter: 'open',
      customerTaskId: 'automation:intake:intake-9',
    })).toBe('/work/queue?workflow=customer&customerFilter=open&customerTask=automation%3Aintake%3Aintake-9');
  });
});
