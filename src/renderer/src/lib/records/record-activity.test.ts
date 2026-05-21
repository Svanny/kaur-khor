import { describe, expect, test } from 'vitest';
import type { SenaCatalog, SenaObservationRecord, SenaRecordUpdateContext } from '@shared/sena';
import {
  buildCustomerLinkDirectoryFromContext,
  latestDeliveryFeeMetadataFromContext,
  observationRecordActivityEntries,
  recordTicketOptions,
} from './record-activity';

const catalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [{
    skuId: 'sku-1',
    name: 'Razor refill',
    description: 'Refill pack',
    supplierName: 'Mekong Looms',
    costPerUnit: 2,
    archived: false,
    soldAsProduct: true,
    productPrice: 5,
    leadTimeMeanDaysHint: null,
    leadTimeStdDaysHint: null,
  }],
  services: [{
    serviceId: 'service-1',
    name: 'Haircut',
    description: '',
    price: 12,
    archived: false,
    bundle: false,
  }],
  bundles: [],
  sharingMask: [],
};

const ticketObservation: SenaObservationRecord = {
  observationId: 'obs-1',
  ownerSub: 'owner',
  input: {
    observedAt: '2026-04-21T10:00:00.000Z',
    stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 8, costPerUnit: 2, productPrice: 5 }],
    retailSalesSnapshot: [],
    serviceSalesSnapshot: [],
    serviceRankings: [],
    retailRankings: [],
    serviceStockouts: [],
    retailStockouts: [],
    orderSignals: [{
      skuId: 'sku-1',
      orderPlaced: true,
      receiptArrived: true,
      approximateOrderQuantity: 4,
      approximateReceiptQuantity: 3,
      placementTimestamp: '2026-04-21T10:03:00.000Z',
      receiptTimestamp: '2026-04-21T10:04:00.000Z',
    }],
    servicePrices: [],
    retailPrices: [],
    leadTimeHints: [],
    adjustmentSignals: [],
    commercialEvents: [],
    ticketEvents: [{
      ticketId: 'ticket-customer-1',
      ticketFamily: 'customer',
      lifecycle: 'open',
      stage: 'pending',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-21T10:05:00.000Z',
      party: {
        role: 'customer',
        channelKey: 'telegram',
        channelLabel: 'Telegram',
        customerName: 'Dara',
        customerNameKey: 'dara',
        phone: '+855 12345678',
        phoneKey: '+85512345678',
      },
      lines: [{ entityType: 'sku', entityId: 'sku-1', quantityDelta: 2 }],
      deliveryFee: {
        bucket: 'customer_order',
        payer: 'customer',
        feeUsd: 1,
        subtotalUsd: 10,
        displayDeliveryUsd: 1,
        displayTotalUsd: 11,
        netSettlementUsd: 11,
      },
      note: 'Telegram order',
    }],
    recipeUsageHints: [],
    deliveryFee: null,
    notes: 'operator note',
  },
};

const context: SenaRecordUpdateContext = {
  observationFingerprint: {
    count: 1,
    latestObservationId: 'obs-1',
    latestObservedAt: '2026-04-21T10:00:00.000Z',
  },
  latestObservedAt: '2026-04-21T10:00:00.000Z',
  latestStockBySku: {
    'sku-1': {
      observationId: 'obs-1',
      observedAt: '2026-04-21T10:00:00.000Z',
      value: ticketObservation.input.stockSnapshot[0]!,
    },
  },
  latestRetailSaleBySku: {},
  latestServiceSaleByService: {},
  latestOrderBySku: {},
  latestReceiptBySku: {},
  openTicketsByFamily: {
    customer: [{
      ...ticketObservation.input.ticketEvents![0]!,
    }],
    supplier: [],
  },
  latestTicketsById: {
    'ticket-customer-1': {
      observationId: 'obs-1',
      observedAt: '2026-04-21T10:05:00.000Z',
      value: {
        ...ticketObservation.input.ticketEvents![0]!,
      },
    },
    'ticket-customer-2': {
      observationId: 'obs-2',
      observedAt: '2026-04-22T10:05:00.000Z',
      value: {
        ...ticketObservation.input.ticketEvents![0]!,
        ticketId: 'ticket-customer-2',
        occurredAt: '2026-04-22T10:05:00.000Z',
        party: {
          ...ticketObservation.input.ticketEvents![0]!.party!,
          phone: '+855 98765432',
          phoneKey: '+85598765432',
        },
      },
    },
  },
  latestDeliveryFeeByBucket: {
    customer_order: {
      observationId: 'obs-1',
      observedAt: '2026-04-21T10:05:00.000Z',
      value: ticketObservation.input.ticketEvents![0]!.deliveryFee!,
    },
  },
  recentActivity: [],
};

function localDateKey(value: string) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

describe('record activity helpers', () => {
  test('builds open ticket options from compact context', () => {
    expect(recordTicketOptions(context, 'customer', catalog)).toEqual([{
      id: 'ticket-customer-1',
      label: 'Ticket ID: 2026-04-21-#1',
      description: 'Dara · Telegram · 1 item',
      metadata: '+855 12345678',
      sortAt: '2026-04-21T10:05:00.000Z',
    }]);
  });

  test('builds supplier ticket options with catalog names instead of internal ids', () => {
    const supplierContext: SenaRecordUpdateContext = {
      ...context,
      openTicketsByFamily: {
        customer: [],
        supplier: [{
          ticketId: 'ticket-supplier-1',
          ticketFamily: 'supplier',
          lifecycle: 'open',
          stage: 'ordered_waiting',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-21T10:10:00.000Z',
          party: { role: 'supplier', supplierName: 'Mekong Looms' },
          lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 4 }],
        }],
      },
    };

    const [option] = recordTicketOptions(supplierContext, 'supplier', catalog);

    expect(option).toMatchObject({
      label: 'Mekong Looms',
      description: 'Mekong Looms',
      metadata: 'Razor refill · 4u',
      sortAt: '2026-04-21T10:10:00.000Z',
    });
    expect([option?.label, option?.description, option?.metadata].join(' ')).not.toContain('sku-');
  });

  test('builds customer ticket options with service and sku names when no party name exists', () => {
    const customerContext: SenaRecordUpdateContext = {
      ...context,
      openTicketsByFamily: {
        customer: [{
          ticketId: 'ticket-customer-lines',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-21T10:10:00.000Z',
          lines: [
            { entityType: 'sku', entityId: 'sku-1', quantityDelta: 2 },
            { entityType: 'service', entityId: 'service-1', quantityDelta: 1 },
          ],
        }],
        supplier: [],
      },
    };

    const [option] = recordTicketOptions(customerContext, 'customer', catalog);

    expect(option?.label).toBe('Ticket ID: 2026-04-21-#2');
    expect(option?.description).toBe('Razor refill, Haircut · No channel · 2 items');
    expect(option?.label).not.toContain('sku-');
    expect(option?.label).not.toContain('service-');
  });

  test('builds fallback ticket option labels by local calendar date', () => {
    const occurredAt = '2026-04-21T17:30:00.000Z';
    const customerContext: SenaRecordUpdateContext = {
      ...context,
      latestTicketsById: {},
      openTicketsByFamily: {
        customer: [{
          ticketId: 'ticket-customer-local-date',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt,
          lines: [{ entityType: 'sku', entityId: 'sku-1', quantityDelta: 2 }],
        }],
        supplier: [],
      },
    };

    const [option] = recordTicketOptions(customerContext, 'customer', catalog);

    expect(option?.label).toBe(`Ticket ID: ${localDateKey(occurredAt)}-#1`);
  });

  test('sorts dirty customer ticket timestamps after valid display labels', () => {
    const dirtyContext: SenaRecordUpdateContext = {
      ...context,
      openTicketsByFamily: {
        customer: [
          {
            ...ticketObservation.input.ticketEvents![0]!,
            ticketId: 'ticket-customer-dirty',
            occurredAt: '2026-04-21-bad',
          },
          {
            ...ticketObservation.input.ticketEvents![0]!,
            ticketId: 'ticket-customer-valid',
            occurredAt: '2026-04-21T10:10:00.000Z',
          },
        ],
        supplier: [],
      },
      latestTicketsById: {},
    };

    expect(recordTicketOptions(dirtyContext, 'customer', catalog).map((option) => option.label)).toEqual([
      'Ticket ID: 2026-04-21-#2',
      'Ticket ID: 2026-04-21-#1',
    ]);
  });

  test('uses non-leaky fallbacks when ticket entity ids are not in the catalog', () => {
    const supplierContext: SenaRecordUpdateContext = {
      ...context,
      openTicketsByFamily: {
        customer: [],
        supplier: [{
          ticketId: 'ticket-supplier-missing',
          ticketFamily: 'supplier',
          lifecycle: 'open',
          stage: 'ordered_waiting',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-21T10:10:00.000Z',
          lines: [
            { entityType: 'sku', entityId: 'sku-secret', orderedQuantity: 4 },
            { entityType: 'service', entityId: 'service-secret', orderedQuantity: 1 },
          ],
        }],
      },
    };

    const [option] = recordTicketOptions(supplierContext, 'supplier', catalog);
    const visibleText = [option?.label, option?.description, option?.metadata].join(' ');

    expect(option?.label).toBe('SKU, Service');
    expect(option?.metadata).toBe('SKU · 4u, Service · 1u');
    expect(visibleText).not.toContain('sku-secret');
    expect(visibleText).not.toContain('service-secret');
  });

  test('keeps dirty supplier ticket quantities out of metadata labels', () => {
    const supplierContext: SenaRecordUpdateContext = {
      ...context,
      openTicketsByFamily: {
        customer: [],
        supplier: [{
          ticketId: 'ticket-supplier-dirty',
          ticketFamily: 'supplier',
          lifecycle: 'open',
          stage: 'ordered_waiting',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-21T10:10:00.000Z',
          party: { role: 'supplier', supplierName: 'Mekong Looms' },
          lines: [
            { entityType: 'sku', entityId: 'sku-1', orderedQuantity: Number.NaN },
            { entityType: 'service', entityId: 'service-1', orderedQuantity: 0 },
          ],
        }],
      },
    };

    const [option] = recordTicketOptions(supplierContext, 'supplier', catalog);

    expect(option?.metadata).toBe('Razor refill, Haircut · 0u');
    expect(option?.metadata).not.toContain('NaN');
  });

  test('builds customer directory from compact ticket summaries', () => {
    const directory = buildCustomerLinkDirectoryFromContext(context);
    expect(directory.names).toEqual(['Dara']);
    expect(directory.entries).toEqual([
      { name: 'Dara', phone: '+855 12345678' },
      { name: 'Dara', phone: '+855 98765432' },
    ]);
    expect(directory.nameToPhone.get('dara')).toBe('+855 12345678');
    expect(directory.phoneToName.get('+85512345678')).toBe('Dara');
    expect(directory.phoneToName.get('+85598765432')).toBe('Dara');
  });

  test('ignores stale customer ticket summaries when context is a blank slate', () => {
    const blankContextWithStaleTickets: SenaRecordUpdateContext = {
      ...context,
      observationFingerprint: {
        count: 0,
        latestObservationId: null,
        latestObservedAt: null,
      },
      latestObservedAt: null,
    };

    const directory = buildCustomerLinkDirectoryFromContext(blankContextWithStaleTickets, []);

    expect(directory.entries).toEqual([]);
    expect(directory.names).toEqual([]);
  });

  test('reads latest delivery fees from context before fallback observations', () => {
    expect(latestDeliveryFeeMetadataFromContext(context, 'customer_order', [])?.displayTotalUsd).toBe(11);
  });

  test('sorts dirty fallback delivery fee timestamps after valid metadata', () => {
    const dirtyObservation: SenaObservationRecord = {
      ...ticketObservation,
      observationId: 'obs-dirty',
      input: {
        ...ticketObservation.input,
        observedAt: 'zzzz',
        deliveryFee: {
          bucket: 'customer_order',
          payer: 'customer',
          feeUsd: 9,
          subtotalUsd: 10,
          displayDeliveryUsd: 9,
          displayTotalUsd: 19,
          netSettlementUsd: 19,
        },
        ticketEvents: [],
      },
    };
    const validObservation: SenaObservationRecord = {
      ...ticketObservation,
      observationId: 'obs-valid',
      input: {
        ...ticketObservation.input,
        observedAt: '2026-04-22T10:00:00.000Z',
        deliveryFee: {
          bucket: 'customer_order',
          payer: 'customer',
          feeUsd: 2,
          subtotalUsd: 10,
          displayDeliveryUsd: 2,
          displayTotalUsd: 12,
          netSettlementUsd: 12,
        },
        ticketEvents: [],
      },
    };

    expect(
      latestDeliveryFeeMetadataFromContext(null, 'customer_order', [dirtyObservation, validObservation])
        ?.displayTotalUsd,
    ).toBe(12);
  });

  test('normalizes observation stock, receipt, and ticket activity using canonical lines', () => {
    const entries = observationRecordActivityEntries(ticketObservation);
    expect(entries.map((entry) => entry.activityType)).toEqual(['ticket', 'receipt', 'order', 'stock']);
    expect(entries.find((entry) => entry.activityType === 'ticket')?.detail).toBe('Telegram order');
  });

  test('sorts dirty observation activity timestamps after valid activity', () => {
    const entries = observationRecordActivityEntries({
      ...ticketObservation,
      input: {
        ...ticketObservation.input,
        observedAt: 'zzzz',
        orderSignals: [{
          skuId: 'sku-1',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 4,
          approximateReceiptQuantity: null,
          placementTimestamp: '2026-04-21T10:03:00.000Z',
          receiptTimestamp: null,
        }],
        ticketEvents: [],
      },
    });

    expect(entries.map((entry) => entry.activityType)).toEqual(['order', 'stock']);
  });
});
