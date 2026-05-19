import { describe, expect, test } from 'vitest';
import {
  buildAnalysisHref,
  buildAutomationHref,
  buildCaptureHref,
  buildFinancialsHref,
  buildInventoryHref,
  buildWorkHref,
  buildPerformanceHref,
  buildSkuDetailHref,
  readCatalogRouteState,
  readAnalysisRouteState,
  readAutomationRouteState,
  readFinancialsRouteState,
  readInsightsRouteState,
  readInventoryRouteState,
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

  test('trims optional route ids and filters before downstream lookup', () => {
    expect(readWorkRouteState(new URLSearchParams('task=%20sku-1%20&customerTask=%20automation:intake:intake-7%20&supplier=%20Mekong%20Looms%20'))).toMatchObject({
      customerTaskId: 'automation:intake:intake-7',
      supplier: 'Mekong Looms',
      taskId: 'sku-1',
    });
    expect(readAutomationRouteState(new URLSearchParams('conversation=%20conv-1%20&intake=%20intake-1%20&ticket=%20ticket-1%20&q=%20telegram%20'))).toMatchObject({
      conversationId: 'conv-1',
      intakeId: 'intake-1',
      q: 'telegram',
      ticketId: 'ticket-1',
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
    ).toBe('/work/queue?filter=ready_to_receive&scope=services&workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1');

    expect(buildAnalysisHref({ section: 'pressure', timeframe: '1Y', supplier: 'Mekong Looms' })).toBe(
      '/insights/explain?section=pressure&supplier=Mekong+Looms&timeframe=1Y',
    );
  });

  test('builds canonical capture lane hrefs', () => {
    expect(buildCaptureHref()).toBe('/work/capture');
    expect(buildCaptureHref({ lane: 'stock-count' })).toBe('/work/capture/stock-count');
    expect(buildCaptureHref({ lane: 'customer-order' }, new URLSearchParams('ticketMode=edit'))).toBe('/work/capture/customer-order?ticketMode=edit');
    expect(buildCaptureHref({ lane: 'supplier-receipt' }, new URLSearchParams('ticketMode=edit'))).toBe('/work/capture/supplier-receipt?ticketMode=edit');
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

  test('reads inventory route state safely and maps performance helpers to inventory', () => {
    expect(readInventoryRouteState(new URLSearchParams('range=7d&scope=skus&projection=30d&rows=all&preset=flow'))).toMatchObject({
      range: '7d',
      scope: 'skus',
      projectionHorizon: '30d',
      rowSet: 'all',
      viewPreset: 'flow',
    });

    expect(readPerformanceRouteState(new URLSearchParams('compare=0&range=7d&scope=skus'))).toEqual({
      compare: false,
      range: '7d',
      scope: 'skus',
      supplier: null,
      customRangeStart: null,
      customRangeEnd: null,
    });

    expect(buildInventoryHref({ range: '30d', scope: 'skus' })).toBe('/insights/inventory');
    expect(buildPerformanceHref({ compare: true, range: '7d' })).toBe('/insights/inventory?range=7d');
  });

  test('bounds and deduplicates inventory custom columns from route params', () => {
    const oversizedColumn = 'x'.repeat(65);
    const columns = [
      'onHand',
      'onHand',
      ' cover ',
      '',
      oversizedColumn,
      ...Array.from({ length: 40 }, (_, index) => `column-${index}`),
    ].join(',');

    const state = readInventoryRouteState(new URLSearchParams(`preset=custom&columns=${encodeURIComponent(columns)}`));

    expect(state.customColumns).toHaveLength(32);
    expect(state.customColumns.slice(0, 3)).toEqual(['onHand', 'cover', 'column-0']);
    expect(state.customColumns).not.toContain(oversizedColumn);
  });

  test('round-trips inventory custom range params safely', () => {
    expect(readPerformanceRouteState(new URLSearchParams('range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z'))).toEqual({
      compare: false,
      range: 'custom',
      scope: 'all',
      supplier: null,
      customRangeStart: '2026-01-01T00:00:00.000Z',
      customRangeEnd: '2026-01-15T23:59:59.999Z',
    });

    expect(buildInventoryHref({
      range: 'custom',
      customRangeStart: '2026-01-01T00:00:00.000Z',
      customRangeEnd: '2026-01-15T23:59:59.999Z',
    })).toBe('/insights/inventory?range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z');
  });

  test('drops malformed inventory and performance custom ranges', () => {
    expect(readInventoryRouteState(new URLSearchParams('range=custom&customStart=bad&customEnd=2026-01-15T23%3A59%3A59.999Z'))).toMatchObject({
      range: '30d',
      customRangeStart: null,
      customRangeEnd: null,
    });
    expect(readPerformanceRouteState(new URLSearchParams('range=custom&customStart=2026-01-15T23%3A59%3A59.999Z&customEnd=2026-01-01T00%3A00%3A00.000Z'))).toMatchObject({
      range: '30d',
      customRangeStart: null,
      customRangeEnd: null,
    });
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

  test('drops malformed financials custom ranges', () => {
    expect(readFinancialsRouteState(new URLSearchParams('range=custom&customStart=2026-02-01&customEnd=2026-02-10'))).toEqual({
      compare: false,
      range: '1d',
      scope: 'all',
      supplier: null,
      customRangeStart: null,
      customRangeEnd: null,
    });
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
    expect(buildSkuDetailHref('sku/with?query#hash')).toBe('/catalog/skus/sku%2Fwith%3Fquery%23hash');
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

  test('drops inactive workflow task params from work links', () => {
    expect(buildWorkHref(
      { workflow: 'customer', customerFilter: 'quoted', customerTaskId: 'automation:intake:intake-1' },
      new URLSearchParams('task=sku-1&taskMode=goods_received'),
    )).toBe('/work/queue?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1');

    expect(buildWorkHref(
      { workflow: 'supplier', taskId: 'sku-1', taskMode: 'goods_received' },
      new URLSearchParams('workflow=customer&customerFilter=quoted&customerTask=automation:intake:intake-1'),
    )).toBe('/work/queue?task=sku-1&taskMode=goods_received');
  });
});
