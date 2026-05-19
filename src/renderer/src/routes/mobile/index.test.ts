import { describe, expect, it } from 'vitest';
import {
  PHONE_CAPTURE_ROUTE_PATHS,
  buildPhoneTodayInventoryRows,
  hasPhoneCaptureDraft,
  phoneCaptureDraftCountsByLane,
  phoneCaptureLaneIdForPath,
  phoneCaptureQuantityError,
  phoneTicketLineDraftQuantity,
  normalizePhoneDraftObservedAt,
  buildPhoneQueueObservationInput,
  phoneSheetTaskForSupplierTask,
  parsePhoneLeadTimeHint,
  parsePhoneExchangeRateDraft,
  parseExplicitPhoneQueueActionDate,
  phoneObservedAtInputToIso,
  sanitizePhoneReturnTo,
} from './index';

const mobileCatalog = {
  bundles: [],
  schemaVersion: 1,
  services: [
    {
      archived: false,
      bundle: false,
      description: '',
      imagePath: null,
      name: 'Haircut',
      price: 12,
      serviceId: 'service-1',
    },
  ],
  sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: 1 }],
  skus: [
    {
      archived: false,
      costPerUnit: 4,
      description: '',
      imagePath: null,
      name: 'Razor refill',
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
      supplierName: 'Mekong Looms',
    },
  ],
  suppliers: [],
} as const;

describe('mobile capture date helpers', () => {
  it('serializes valid datetime-local values', () => {
    expect(parseExplicitPhoneQueueActionDate('2026-02-28T08:30')).toBe(
      new Date('2026-02-28T08:30').toISOString(),
    );
    expect(phoneObservedAtInputToIso('2026-02-28T08:30')).toBe(
      new Date('2026-02-28T08:30').toISOString(),
    );
  });

  it('rejects impossible datetime-local values instead of rolling them forward', () => {
    expect(parseExplicitPhoneQueueActionDate('2026-02-31T08:30')).toBeNull();
    expect(parseExplicitPhoneQueueActionDate('2026-02-28T24:00')).toBeNull();
    expect(phoneObservedAtInputToIso('2026-02-31T08:30')).toBeNull();
    expect(phoneObservedAtInputToIso('2026-02-28T24:00')).toBeNull();
  });

  it('drops corrupt restored draft timestamps before they reach capture forms', () => {
    expect(normalizePhoneDraftObservedAt('2026-02-28T08:30')).toBe('2026-02-28T08:30');
    expect(normalizePhoneDraftObservedAt('2026-02-31T08:30')).toBe('');
    expect(normalizePhoneDraftObservedAt('not-a-date')).toBe('');
    expect(normalizePhoneDraftObservedAt(null)).toBe('');
  });
});

describe('mobile capture quantity helpers', () => {
  it('allows zero for stock counts but not customer or supplier actions', () => {
    expect(phoneCaptureQuantityError('stock-count', '0')).toBeNull();
    expect(phoneCaptureQuantityError('customer-order-pending', '1,000')).toBeNull();
    expect(phoneCaptureQuantityError('customer-order-pending', '0')).toBe(
      'Enter a quantity greater than zero before saving.',
    );
    expect(phoneCaptureQuantityError('supplier-order-pending', '0')).toBe(
      'Enter a quantity greater than zero before saving.',
    );
  });

  it('rejects invalid and negative quantities', () => {
    expect(phoneCaptureQuantityError('stock-count', '')).toBe('Enter a valid quantity before saving.');
    expect(phoneCaptureQuantityError('stock-count', '   ')).toBe('Enter a valid quantity before saving.');
    expect(phoneCaptureQuantityError('stock-count', '-1')).toBe('Enter a valid quantity before saving.');
    expect(phoneCaptureQuantityError('customer-order-completed', 'nope')).toBe('Enter a valid quantity before saving.');
  });

  it('does not prefill phone capture drafts from non-finite ticket quantities', () => {
    expect(phoneTicketLineDraftQuantity({ entityType: 'sku', entityId: 'sku-1', quantityDelta: Number.NaN })).toBeNull();
    expect(phoneTicketLineDraftQuantity({ entityType: 'sku', entityId: 'sku-1', orderedQuantity: Infinity })).toBeNull();
    expect(phoneTicketLineDraftQuantity({ entityType: 'sku', entityId: 'sku-1', receivedQuantity: 3 })).toBe(3);
  });
});

describe('mobile today inventory rows', () => {
  it('ignores non-finite daily received and sold quantities', () => {
    const observedAt = new Date().toISOString();

    const rows = buildPhoneTodayInventoryRows({
      catalog: mobileCatalog as never,
      inventory: {
        observations: [
          {
            observationId: 'obs-dirty-phone-quantities',
            ownerSub: 'desktop-owner',
            input: {
              observedAt,
              stockSnapshot: [],
              serviceRankings: [],
              retailRankings: [],
              serviceStockouts: [],
              retailStockouts: [],
              orderSignals: [
                {
                  skuId: 'sku-1',
                  orderPlaced: false,
                  receiptArrived: true,
                  approximateOrderQuantity: null,
                  approximateReceiptQuantity: Number.POSITIVE_INFINITY,
                  placementTimestamp: null,
                  receiptTimestamp: observedAt,
                },
              ],
              servicePrices: [],
              retailPrices: [],
              leadTimeHints: [],
              commercialEvents: [
                {
                  party: 'customer',
                  entityType: 'service',
                  entityId: 'service-1',
                  stage: 'realized',
                  quantityDelta: Number.NaN,
                  flow: 'scheduled',
                  reason: 'from_pending',
                },
              ],
              notes: null,
            },
          },
        ],
        recordUpdateContext: null,
        workspaceSummary: null,
      } as never,
    });

    expect(rows[0]).toMatchObject({
      id: 'sku-1',
      unitsIn: 0,
      unitsOut: 0,
    });
  });
});

describe('mobile queue quick action payloads', () => {
  it('saves comma-formatted quick action quantities into generated observations', () => {
    const customerInput = buildPhoneQueueObservationInput({
      action: 'mark_completed',
      actionLabel: 'Mark completed',
      href: '/work/capture/customer-completed',
      meta: 'Customer',
      quantitySuggestion: null,
      scope: 'customer',
      source: 'Task',
      targetId: 'service-1',
      targetType: 'service',
      ticket: null,
      title: 'Haircut',
    } as unknown as Parameters<typeof buildPhoneQueueObservationInput>[0], '1,000', '2026-02-28T08:30', '');

    expect(customerInput?.commercialEvents).toEqual([
      expect.objectContaining({
        entityId: 'service-1',
        entityType: 'service',
        quantityDelta: 1000,
      }),
    ]);

    const supplierInput = buildPhoneQueueObservationInput({
      action: 'receive',
      actionLabel: 'Receive',
      href: '/work/capture/supplier-receipt',
      meta: 'Supplier',
      quantitySuggestion: null,
      scope: 'supplier',
      source: 'Task',
      supplierName: 'Mekong Looms',
      targetId: 'sku-1',
      targetType: 'sku',
      ticket: null,
      title: 'Razor refill',
    } as unknown as Parameters<typeof buildPhoneQueueObservationInput>[0], '2,500', '2026-02-28T08:30', '');

    expect(supplierInput?.orderSignals).toEqual([
      expect.objectContaining({
        approximateReceiptQuantity: 2500,
        skuId: 'sku-1',
      }),
    ]);
  });
});

describe('mobile capture draft storage', () => {
  it('does not count corrupt saved draft keys as resumable phone drafts', () => {
    window.sessionStorage.setItem(
      'kaur-khor:phone-capture-draft:stock-count:sku-1',
      '{not valid json',
    );
    window.sessionStorage.setItem(
      'kaur-khor:phone-capture-draft:customer-order-pending:service-1',
      JSON.stringify({ note: 'regular', quantity: '2' }),
    );

    const counts = phoneCaptureDraftCountsByLane();

    expect(counts.get('stock-count')).toBeUndefined();
    expect(counts.get('customer-order-pending')).toBe(1);
  });

  it('checks the same sessionStorage drafts that phone capture forms persist', () => {
    const draftKey = 'kaur-khor:phone-capture-draft:stock-count:sku-1';
    window.localStorage.setItem(draftKey, JSON.stringify({ note: 'stale local draft', quantity: '9' }));

    expect(hasPhoneCaptureDraft(draftKey)).toBe(false);

    window.sessionStorage.setItem(draftKey, JSON.stringify({ note: 'session draft', quantity: '2' }));

    expect(hasPhoneCaptureDraft(draftKey)).toBe(true);
  });

  it('does not prompt to resume corrupt phone capture drafts', () => {
    const draftKey = 'kaur-khor:phone-capture-draft:stock-count:sku-1';
    window.sessionStorage.setItem(draftKey, '{not valid json');

    expect(hasPhoneCaptureDraft(draftKey)).toBe(false);
  });
});

describe('mobile supplier lead-time helpers', () => {
  it('accepts comma-formatted positive day hints', () => {
    expect(parsePhoneLeadTimeHint('1,000')).toBe(1000);
    expect(parsePhoneLeadTimeHint('')).toBeNull();
    expect(parsePhoneLeadTimeHint('0')).toBeNull();
    expect(parsePhoneLeadTimeHint('-1')).toBeNull();
  });
});

describe('mobile preferences helpers', () => {
  it('accepts comma-formatted positive exchange rates', () => {
    expect(parsePhoneExchangeRateDraft('4,100')).toBe(4100);
    expect(parsePhoneExchangeRateDraft('')).toBeNull();
    expect(parsePhoneExchangeRateDraft('0')).toBeNull();
    expect(parsePhoneExchangeRateDraft('-1')).toBeNull();
    expect(parsePhoneExchangeRateDraft('nope')).toBeNull();
  });
});

describe('mobile capture return links', () => {
  it('keeps only internal return targets from route state', () => {
    expect(sanitizePhoneReturnTo('/work/queue?workflow=customer', '/work/capture')).toBe(
      '/work/queue?workflow=customer',
    );
    expect(sanitizePhoneReturnTo('https://example.test/phish', '/work/capture')).toBe('/work/capture');
    expect(sanitizePhoneReturnTo('//example.test/phish', '/work/capture')).toBe('/work/capture');
    expect(sanitizePhoneReturnTo('javascript:alert(1)', '/work/capture')).toBe('/work/capture');
  });
});

describe('mobile supplier queue task links', () => {
  it('recognizes the supplier receipt capture route as a real mobile lane', () => {
    expect(phoneCaptureLaneIdForPath('/work/capture/supplier-receipt?ticketMode=edit')).toBe('supplier-receipt');
    expect(PHONE_CAPTURE_ROUTE_PATHS).toContain('/work/capture/supplier-receipt/*');
  });

  it('does not match partial mobile capture lane path prefixes', () => {
    expect(phoneCaptureLaneIdForPath('/work/capture/stock-count-extra')).toBeNull();
    expect(phoneCaptureLaneIdForPath('/work/capture/stock-count/nested')).toBe('stock-count');
  });

  it('routes supplier ticket receive actions to the supplier receipt capture lane', () => {
    const task = phoneSheetTaskForSupplierTask({
      action: 'receive',
      actionLabel: 'Receive',
      childTasks: [
        { skuId: 'sku-1' },
        { skuId: 'sku-2' },
      ],
      id: 'supplier-ticket:ticket-1',
      kind: 'supplier_ticket',
      skuSummaryLabel: '2 SKUs',
      stateLabel: 'Ready to receive',
      supplierName: 'Mekong Looms',
      ticket: null,
      ticketId: 'ticket-1',
      whyNow: 'Due now',
    } as unknown as Parameters<typeof phoneSheetTaskForSupplierTask>[0]);

    expect(task.href).toBe(
      '/work/capture/supplier-receipt?ticketMode=edit&ticketId=ticket-1&skus=sku-1%2Csku-2&flashTargets=supplier-receipt%3Asku-1%2Csupplier-receipt%3Asku-2',
    );
  });

  it('keeps supplier ticket context for SKU receive actions', () => {
    const task = phoneSheetTaskForSupplierTask({
      action: 'receive',
      actionLabel: 'Receive',
      batchOrderId: null,
      childOrderId: null,
      id: 'supplier-ticket:ticket-1:sku-1',
      kind: 'sku',
      skuId: 'sku-1',
      skuName: 'Razor refill',
      stateLabel: 'Ready to receive',
      supplierName: 'Mekong Looms',
      supplierTicketId: 'ticket-1',
      whyNow: 'Due now',
    } as unknown as Parameters<typeof phoneSheetTaskForSupplierTask>[0]);

    expect(task.href).toBe(
      '/work/capture/supplier-receipt?ticketMode=edit&ticketId=ticket-1&targetAction=supplier-receipt&targetType=sku&targetId=sku-1',
    );
  });

  it('keeps supplier ticket context and item cards for batched SKU receive actions', () => {
    const tasks: Parameters<typeof phoneSheetTaskForSupplierTask>[0][] = [
      {
        action: 'receive',
        actionLabel: 'Receive',
        batchOrderId: null,
        childOrderId: null,
        id: 'supplier-ticket:ticket-1:sku-1',
        kind: 'sku',
        skuId: 'sku-1',
        skuName: 'Razor refill',
        stateLabel: 'Ready to receive',
        supplierName: 'Mekong Looms',
        supplierTicketId: 'ticket-1',
        whyNow: 'Due now',
      },
      {
        action: 'receive',
        actionLabel: 'Receive',
        batchOrderId: null,
        childOrderId: null,
        id: 'supplier-ticket:ticket-1:sku-2',
        kind: 'sku',
        skuId: 'sku-2',
        skuName: 'Cotton towel',
        stateLabel: 'Ready to receive',
        supplierName: 'Mekong Looms',
        supplierTicketId: 'ticket-1',
        whyNow: 'Due now',
      },
    ] as unknown as Parameters<typeof phoneSheetTaskForSupplierTask>[0][];

    const task = phoneSheetTaskForSupplierTask(tasks[0]!, tasks);

    expect(task.batchUpdateHref).toBe(
      '/work/capture/supplier-receipt?ticketMode=edit&ticketId=ticket-1&skus=sku-1%2Csku-2&flashTargets=supplier-receipt%3Asku-1%2Csupplier-receipt%3Asku-2',
    );
  });
});
