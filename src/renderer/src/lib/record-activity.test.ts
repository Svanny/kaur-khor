import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord, SenaRecordUpdateContext } from '@shared/sena';
import {
  buildCustomerLinkDirectoryFromContext,
  latestDeliveryFeeMetadataFromContext,
  observationRecordActivityEntries,
  recordTicketOptions,
} from './record-activity';

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

describe('record activity helpers', () => {
  test('builds open ticket options from compact context', () => {
    expect(recordTicketOptions(context, 'customer')).toEqual([{
      id: 'ticket-customer-1',
      label: 'Dara',
      description: 'Telegram · 1 item',
      metadata: '+855 12345678',
    }]);
  });

  test('builds customer directory from compact ticket summaries', () => {
    const directory = buildCustomerLinkDirectoryFromContext(context);
    expect(directory.names).toEqual(['Dara']);
    expect(directory.nameToPhone.get('dara')).toBe('+855 12345678');
    expect(directory.phoneToName.get('+85512345678')).toBe('Dara');
  });

  test('reads latest delivery fees from context before fallback observations', () => {
    expect(latestDeliveryFeeMetadataFromContext(context, 'customer_order', [])?.displayTotalUsd).toBe(11);
  });

  test('normalizes observation stock, receipt, and ticket activity using canonical lines', () => {
    const entries = observationRecordActivityEntries(ticketObservation);
    expect(entries.map((entry) => entry.activityType)).toEqual(['ticket', 'receipt', 'order', 'stock']);
    expect(entries.find((entry) => entry.activityType === 'ticket')?.detail).toBe('Telegram order');
  });
});
