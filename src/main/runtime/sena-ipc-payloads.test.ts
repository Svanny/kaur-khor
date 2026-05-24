// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  normalizeSenaCatalogPayload,
  normalizeSenaCreateOrderBatchPayload,
  normalizeSenaDetailCacheClearPayload,
  normalizeSenaObservationDeletePayload,
  normalizeSenaObservationInputPayload,
  normalizeSenaObservationPageRequest,
  normalizeSenaOrderLookupPayload,
  normalizeSenaObservationUpdatePayload,
  normalizeSenaRunLookupPayload,
  normalizeSenaServiceLookupPayload,
  normalizeSenaSplitOrderChildPayload,
  normalizeSenaSkuLookupPayload,
  normalizeSenaTriggerRunPayload,
  normalizeSenaUpdateOrderBatchPayload,
  normalizeSenaUpdateOrderChildPayload,
} from './sena-ipc-payloads';

describe('SENA IPC payload validation', () => {
  it('normalizes detail lookup payloads before cache keys are built', () => {
    expect(normalizeSenaSkuLookupPayload({ skuId: ' sku-1 ' })).toEqual({
      skuId: 'sku-1',
      beforeIntervalIndex: null,
      limit: 20,
    });
    expect(normalizeSenaServiceLookupPayload({ serviceId: ' service-1 ', beforeIntervalIndex: 10, limit: 5 })).toEqual({
      serviceId: 'service-1',
      beforeIntervalIndex: 10,
      limit: 5,
    });
    expect(normalizeSenaObservationPageRequest({
      beforeObservationId: ' obs-1 ',
      beforeObservedAt: ' 2026-04-02T00:00:00Z ',
      limit: 25,
    })).toEqual({
      beforeObservationId: 'obs-1',
      beforeObservedAt: '2026-04-02T00:00:00Z',
      limit: 25,
    });
    expect(normalizeSenaObservationPageRequest()).toBeUndefined();
    expect(normalizeSenaOrderLookupPayload({
      batchOrderId: ' batch-1 ',
      childOrderId: ' child-1 ',
      skuId: ' sku-1 ',
      supplierName: ' Supplier A ',
      status: 'awaiting_receipt',
    })).toEqual({
      batchOrderId: 'batch-1',
      childOrderId: 'child-1',
      skuId: 'sku-1',
      supplierName: 'Supplier A',
      status: 'awaiting_receipt',
    });
    expect(normalizeSenaOrderLookupPayload()).toBeUndefined();
  });

  it('rejects malformed detail lookup payloads', () => {
    expect(() => normalizeSenaSkuLookupPayload(null as never))
      .toThrow('SENA SKU detail lookup must be an object.');
    expect(() => normalizeSenaSkuLookupPayload({ skuId: '' }))
      .toThrow('SENA SKU detail lookup requires a SKU id.');
    expect(() => normalizeSenaServiceLookupPayload({ serviceId: 'service-1', limit: Number.NaN }))
      .toThrow('SENA service detail limit must be a positive finite number.');
    expect(() => normalizeSenaServiceLookupPayload({ serviceId: 'service-1', limit: 0 }))
      .toThrow('SENA service detail limit must be a positive finite number.');
    expect(() => normalizeSenaServiceLookupPayload({ serviceId: 'service-1', limit: 1.5 }))
      .toThrow('SENA service detail limit must be a positive finite number.');
    expect(() => normalizeSenaSkuLookupPayload({ skuId: 'sku-1', beforeIntervalIndex: -1 }))
      .toThrow('SENA SKU detail before interval must be a non-negative finite number or null.');
    expect(() => normalizeSenaSkuLookupPayload({ skuId: 'sku-1', beforeIntervalIndex: 1.5 }))
      .toThrow('SENA SKU detail before interval must be a non-negative finite number or null.');
    expect(() => normalizeSenaObservationPageRequest([] as never))
      .toThrow('SENA observation page request must be an object.');
    expect(() => normalizeSenaObservationPageRequest({ limit: 1.5 }))
      .toThrow('SENA observation page limit must be a positive finite number.');
    expect(() => normalizeSenaObservationPageRequest({ beforeObservedAt: 42 } as never))
      .toThrow('SENA observation page cursor timestamp must be a string or null.');
    expect(() => normalizeSenaObservationPageRequest({ beforeObservedAt: 'not-a-date' } as never))
      .toThrow('SENA observation page cursor timestamp must be an ISO timestamp or null.');
    expect(() => normalizeSenaObservationPageRequest({ beforeObservedAt: '2026-02-31T00:00:00Z' } as never))
      .toThrow('SENA observation page cursor timestamp must be an ISO timestamp or null.');
    expect(() => normalizeSenaOrderLookupPayload([] as never))
      .toThrow('SENA order lookup must be an object.');
    expect(() => normalizeSenaOrderLookupPayload({ status: 'dirty' } as never))
      .toThrow('SENA order lookup requires a supported status.');
    expect(() => normalizeSenaOrderLookupPayload({ skuId: 42 } as never))
      .toThrow('SENA order lookup SKU id must be a string or null.');
  });

  it('rejects malformed mutation and run lookup payloads', () => {
    expect(() => normalizeSenaSkuLookupPayload([] as never))
      .toThrow('SENA SKU detail lookup must be an object.');
    expect(() => normalizeSenaCatalogPayload(null as never))
      .toThrow('SENA catalog upsert must be an object.');
    expect(() => normalizeSenaCatalogPayload({
      bundles: [],
      schemaVersion: 1,
      services: [],
      sharingMask: 'dirty',
      skus: [],
    } as never)).toThrow('SENA catalog upsert requires sharing mask entries.');
    expect(() => normalizeSenaCatalogPayload({
      bundles: [],
      schemaVersion: 1,
      services: [{ serviceId: 'service-1' }],
      sharingMask: [
        { serviceId: ' service-1 ', skuId: 'sku-1', enabled: true, usageProbability: null },
        { serviceId: 'service-1', skuId: ' sku-1 ', enabled: true, usageProbability: null },
      ],
      skus: [{ skuId: 'sku-1' }],
    } as never)).toThrow('SENA catalog upsert must not contain duplicate service/SKU links.');
    expect(() => normalizeSenaCatalogPayload({
      bundles: [],
      schemaVersion: 1,
      services: [],
      sharingMask: [],
      skus: [{
        archived: false,
        costPerUnit: Number.NaN,
        description: 'Dirty',
        leadTimeMeanDaysHint: null,
        leadTimeStdDaysHint: null,
        name: 'Dirty',
        productPrice: null,
        skuId: 'sku-1',
        soldAsProduct: true,
      }],
    } as never)).toThrow('SENA catalog SKU cost must be a non-negative finite number.');
    expect(() => normalizeSenaCatalogPayload({
      bundles: [],
      schemaVersion: 1,
      services: [{
        archived: false,
        bundle: false,
        description: 'Dirty',
        name: 'Dirty',
        price: Number.POSITIVE_INFINITY,
        serviceId: 'service-1',
      }],
      sharingMask: [],
      skus: [],
    } as never)).toThrow('SENA catalog service price must be a non-negative finite number.');
    expect(() => normalizeSenaCatalogPayload({
      bundles: [],
      schemaVersion: 1,
      services: [],
      sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: 1.5 }],
      skus: [],
    } as never)).toThrow('SENA catalog sharing mask usage probability must be between 0 and 1 or null.');
    expect(() => normalizeSenaCatalogPayload({
      bundles: [],
      schemaVersion: 1,
      services: [],
      sharingMask: [{ enabled: 'yes', serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
      skus: [],
    } as never)).toThrow('SENA catalog sharing mask enabled flag must be a boolean.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: 'dirty',
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA observation input requires service price entries.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      ticketEvents: 'dirty',
      notes: null,
    } as never)).toThrow('SENA observation input ticket events must be an array.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: 'not-a-date',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA observation input observed timestamp must be an ISO timestamp.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-02-31T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA observation input observed timestamp must be an ISO timestamp.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: Number.NaN, costPerUnit: 2, productPrice: 5 }],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA stock snapshot units must be a non-negative finite number.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [{ skuId: ' sku-1 ', unitsInStock: 8, costPerUnit: 2, productPrice: 5 }],
      serviceRankings: ['service-1', ' service-1 '],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA service rankings must not contain duplicate service ids.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [
        { skuId: 'sku-1', unitsInStock: 8, costPerUnit: 2, productPrice: 5 },
        { skuId: ' sku-1 ', unitsInStock: 9, costPerUnit: 2, productPrice: 5 },
      ],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA stock snapshot entries must not contain duplicate SKU ids.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [
        { serviceId: 'service-1', price: 10 },
        { serviceId: ' service-1 ', price: 12 },
      ],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA service price entries must not contain duplicate service ids.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [{ skuId: 'sku-1', orderPlaced: true, receiptArrived: false, approximateOrderQuantity: Number.NaN, approximateReceiptQuantity: null }],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA order signal order quantity must be a non-negative finite number or null.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [{ serviceId: 'service-1', price: Number.POSITIVE_INFINITY }],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA service price must be a non-negative finite number.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [{ skuId: 'sku-1', price: Number.NaN }],
      leadTimeHints: [],
      notes: null,
    } as never)).toThrow('SENA retail price must be a non-negative finite number.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [{ skuId: 'sku-1', typicalDays: Number.POSITIVE_INFINITY, lowDays: null, highDays: null, variabilityClass: null }],
      notes: null,
    } as never)).toThrow('SENA lead time typical days must be a non-negative finite number or null.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [{ skuId: 'sku-1', quantityDelta: Number.NaN }],
      notes: null,
    } as never)).toThrow('SENA adjustment signal quantity must be a finite number.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      recipeUsageHints: [{ serviceId: 'service-1', skuId: 'sku-1', typicalUnitsPerInstance: 1, usageProbability: Number.NaN, variability: 0 }],
      notes: null,
    } as never)).toThrow('SENA recipe usage hint probability must be a non-negative finite number or null.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      commercialEvents: [{
        party: 'customer',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        flow: 'scheduled',
        quantityDelta: Number.POSITIVE_INFINITY,
      }],
      notes: null,
    } as never)).toThrow('SENA commercial event quantity must be a finite number.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      deliveryFee: { feeUsd: Number.NaN, payer: 'customer', bucket: 'customer_order' },
      notes: null,
    } as never)).toThrow('SENA delivery fee amount must be a non-negative finite number or null.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      discount: { mode: 'percent', amountUsd: null, percent: 101 },
      notes: null,
    } as never)).toThrow('SENA discount percent must be between 0 and 100 or null.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      ticketEvents: [{
        ticketId: 'ticket-1',
        ticketFamily: 'customer',
        lifecycle: 'open',
        stage: 'pending',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-02T00:00:00Z',
        lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: -1 }],
      }],
      notes: null,
    } as never)).toThrow('SENA ticket line ordered quantity must be a non-negative finite number or null.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      ticketEvents: [
        {
          ticketId: ' ticket-1 ',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-02T00:00:00Z',
          lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 1 }],
        },
        {
          ticketId: 'ticket-1',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 2,
          eventType: 'updated',
          occurredAt: '2026-04-02T00:01:00Z',
          lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 2 }],
        },
      ],
      notes: null,
    } as never)).toThrow('SENA ticket events must not contain duplicate ticket ids.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      ticketEvents: [{
        ticketId: 'ticket-1',
        ticketFamily: 'customer',
        lifecycle: 'open',
        stage: 'pending',
        revision: 1.5,
        eventType: 'created',
        occurredAt: '2026-04-02T00:00:00Z',
        lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 1 }],
      }],
      notes: null,
    } as never)).toThrow('SENA ticket event revision must be a non-negative integer.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      ticketEvents: [{
        ticketId: 'ticket-1',
        ticketFamily: 'customer',
        lifecycle: 'open',
        stage: 'pending',
        revision: 1,
        eventType: 'created',
        occurredAt: 'not-a-date',
        lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 1 }],
      }],
      notes: null,
    } as never)).toThrow('SENA ticket event occurred timestamp must be an ISO timestamp.');
    expect(() => normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      ticketEvents: [{
        ticketId: 'ticket-1',
        ticketFamily: 'customer',
        lifecycle: 'open',
        stage: 'pending',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-02T00:00:00Z',
        lines: [{ entityType: 'sku', entityId: 'sku-1', unitCost: Number.NaN }],
      }],
      notes: null,
    } as never)).toThrow('SENA ticket line unit cost must be a non-negative finite number or null.');
    expect(() => normalizeSenaCreateOrderBatchPayload({ shared: {}, children: [{ skuId: ' ' }] } as never))
      .toThrow('SENA order batch create child requires a SKU id.');
    expect(() => normalizeSenaCreateOrderBatchPayload({
      children: [{ skuId: 'sku-1' }],
      shared: { orderedQuantity: Number.NaN },
    } as never)).toThrow('SENA order ordered quantity must be a non-negative finite number or null.');
    expect(() => normalizeSenaCreateOrderBatchPayload({
      children: [{ skuId: 'sku-1' }],
      shared: { costPerUnit: -1 },
    } as never)).toThrow('SENA order cost per unit must be a non-negative finite number or null.');
    expect(() => normalizeSenaCreateOrderBatchPayload({
      children: [{ skuId: 'sku-1', overrides: { receivedQuantity: Infinity } }],
      shared: {},
    } as never)).toThrow('SENA order received quantity must be a non-negative finite number or null.');
    expect(() => normalizeSenaCreateOrderBatchPayload({
      children: [{ skuId: 'sku-1' }],
      shared: { expectedArrivalAt: '2026-02-31T00:00:00Z' },
    } as never)).toThrow('SENA order expected arrival timestamp must be an ISO timestamp or null.');
    expect(() => normalizeSenaCreateOrderBatchPayload({
      children: [{ skuId: 'sku-1' }],
      shared: { leadTimeVariability: 'wild' },
    } as never)).toThrow('SENA order lead time variability requires a supported value.');
    expect(() => normalizeSenaCreateOrderBatchPayload({
      children: [{ skuId: 'sku-1' }],
      shared: { discount: { mode: 'amount', amountUsd: -1 } },
    } as never)).toThrow('SENA discount amount must be a non-negative finite number or null.');
    expect(() => normalizeSenaUpdateOrderBatchPayload({ batchOrderId: ' ' } as never))
      .toThrow('SENA order batch update requires a batch order id.');
    expect(() => normalizeSenaUpdateOrderBatchPayload({ batchOrderId: 'batch-1', status: 'dirty' } as never))
      .toThrow('SENA order batch update requires a supported status.');
    expect(() => normalizeSenaUpdateOrderChildPayload({ childOrderId: ' ' } as never))
      .toThrow('SENA order child update requires a child order id.');
    expect(() => normalizeSenaUpdateOrderChildPayload({ childOrderId: 'child-1', status: 'dirty' } as never))
      .toThrow('SENA order child update requires a supported status.');
    expect(() => normalizeSenaSplitOrderChildPayload(null as never))
      .toThrow('SENA order child split must be an object.');
    expect(() => normalizeSenaObservationUpdatePayload({ observationId: '', input: {} } as never))
      .toThrow('SENA observation update requires an observation id.');
    expect(() => normalizeSenaObservationUpdatePayload({ observationId: 'obs-1', input: null } as never))
      .toThrow('SENA observation update requires observation input.');
    expect(() => normalizeSenaObservationUpdatePayload({ observationId: 'obs-1', input: [] } as never))
      .toThrow('SENA observation update requires observation input.');
    expect(() => normalizeSenaObservationDeletePayload({ observationId: ' ' }))
      .toThrow('SENA observation delete requires an observation id.');
    expect(() => normalizeSenaRunLookupPayload(undefined as never))
      .toThrow('SENA run lookup must be an object.');
    expect(() => normalizeSenaTriggerRunPayload([] as never))
      .toThrow('SENA trigger run payload must be an object.');
    expect(() => normalizeSenaDetailCacheClearPayload({ entityId: 'sku-1', entityType: 'product' } as never))
      .toThrow('SENA detail cache clear requires a supported entity type.');
    expect(() => normalizeSenaDetailCacheClearPayload({ entityId: ' ', entityType: 'sku' }))
      .toThrow('SENA detail cache clear requires an entity id.');
  });

  it('normalizes mutation, run lookup, and cache-clear ids before backend or cache use', () => {
    const input = {
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      retailStockouts: [],
      retailPrices: [],
      orderSignals: [],
      serviceStockouts: [],
      servicePrices: [],
      ticketEvents: [],
      leadTimeHints: [],
      notes: null,
    };

    expect(normalizeSenaObservationUpdatePayload({ observationId: ' obs-1 ', input })).toEqual({
      observationId: 'obs-1',
      input,
    });
    expect(normalizeSenaObservationInputPayload({
      ...input,
      observedAt: ' 2026-04-02T00:00:00Z ',
      notes: ' Stock counted ',
    })).toEqual({
      ...input,
      observedAt: '2026-04-02T00:00:00Z',
      notes: 'Stock counted',
    });
    expect(normalizeSenaObservationUpdatePayload({
      input: {
        ...input,
        observedAt: ' 2026-04-02T00:00:00Z ',
        notes: ' ',
      },
      observationId: ' observation-1 ',
    })).toMatchObject({
      input: {
        observedAt: '2026-04-02T00:00:00Z',
        notes: null,
      },
      observationId: 'observation-1',
    });
    expect(normalizeSenaObservationDeletePayload({ observationId: ' obs-2 ' })).toEqual({
      observationId: 'obs-2',
    });
    expect(normalizeSenaRunLookupPayload({ runId: ' run-1 ' })).toEqual({
      runId: 'run-1',
    });
    const catalog = {
      bundles: [{ bundleId: ' bundle-1 ', name: 'Bundle 1', serviceId: ' service-1 ' }],
      schemaVersion: 1,
      services: [{
        archived: false,
        bundle: false,
        description: 'Service',
        name: 'Service',
        price: 12,
        serviceId: ' service-1 ',
      }],
      sharingMask: [{ enabled: true, serviceId: ' service-1 ', skuId: ' sku-1 ', usageProbability: null }],
      skus: [{
        archived: false,
        costPerUnit: 4,
        description: 'SKU',
        leadTimeMeanDaysHint: null,
        leadTimeStdDaysHint: null,
        name: 'SKU',
        productPrice: null,
        skuId: ' sku-1 ',
        soldAsProduct: true,
      }],
    };
    expect(normalizeSenaCatalogPayload(catalog)).toMatchObject({
      bundles: [{ bundleId: 'bundle-1', serviceId: 'service-1' }],
      services: [{ serviceId: 'service-1' }],
      sharingMask: [{ serviceId: 'service-1', skuId: 'sku-1' }],
      skus: [{ skuId: 'sku-1' }],
    });
    expect(normalizeSenaCreateOrderBatchPayload({
      children: [{
        skuId: ' sku-1 ',
        overrides: {
          supplierNote: ' child note ',
        },
      }],
      shared: {
        supplierName: '  ',
        supplierNote: ' batch note ',
        expectedArrivalAt: ' 2026-04-03T00:00:00Z ',
      },
      supplierName: '  ',
    })).toEqual({
      children: [{
        skuId: 'sku-1',
        overrides: {
          supplierNote: 'child note',
        },
      }],
      shared: {
        supplierName: null,
        supplierNote: 'batch note',
        expectedArrivalAt: '2026-04-03T00:00:00Z',
      },
      supplierName: null,
    });
    expect(normalizeSenaUpdateOrderBatchPayload({
      batchOrderId: ' batch-1 ',
      shared: { supplierName: ' Supplier A ' },
      supplierName: '  ',
    })).toEqual({
      batchOrderId: 'batch-1',
      shared: { supplierName: 'Supplier A' },
      supplierName: null,
    });
    expect(normalizeSenaUpdateOrderChildPayload({
      appendSupplierNote: '   ',
      childOrderId: ' child-1 ',
      overrides: { receiptTimestamp: ' 2026-04-04T00:00:00Z ', supplierName: '  ' },
      skuId: ' sku-1 ',
    })).toEqual({
      appendSupplierNote: null,
      childOrderId: 'child-1',
      overrides: { receiptTimestamp: '2026-04-04T00:00:00Z', supplierName: null },
      skuId: 'sku-1',
    });
    expect(normalizeSenaSplitOrderChildPayload({ childOrderId: ' child-1 ' })).toEqual({
      childOrderId: 'child-1',
    });
    expect(normalizeSenaTriggerRunPayload({
      algorithmVersion: ' sena-analysis-v4 ',
      parameters: {
        algorithmVersion: 'sena-analysis-v4',
        particleCount: Number.NaN,
        smoothingEnabled: 'yes' as never,
      } as never,
    })).toEqual({
      algorithmVersion: 'sena-analysis-v4',
      parameters: {
        algorithmVersion: 'sena-analysis-v4',
        particleCount: 256,
        targetServiceLevel: 0.95,
        recommendationQuantile: 0.7,
        intervalLowQuantile: 0.1,
        intervalHighQuantile: 0.9,
        needProbabilityGate: 0.5,
        reviewDelayDays: 0,
        smoothingEnabled: false,
      },
    });
    expect(normalizeSenaTriggerRunPayload(null as never)).toBeUndefined();
    expect(normalizeSenaDetailCacheClearPayload({ entityId: ' sku-1 ', entityType: 'sku' })).toEqual({
      entityId: 'sku-1',
      entityType: 'sku',
    });
  });

  it('normalizes nested observation entity ids before backend ingestion', () => {
    const normalized = normalizeSenaObservationInputPayload({
      observedAt: '2026-04-02T00:00:00Z',
      stockSnapshot: [{ skuId: ' sku-1 ', unitsInStock: 5, costPerUnit: 2, productPrice: 7 }],
      retailSalesSnapshot: [{ skuId: ' sku-2 ', unitsSold: 1 }],
      serviceSalesSnapshot: [{ serviceId: ' service-1 ', unitsSold: 1 }],
      serviceRankings: [' service-1 '],
      retailRankings: [' sku-1 '],
      serviceStockouts: [' service-2 '],
      retailStockouts: [' sku-3 '],
      orderSignals: [{
        approximateOrderQuantity: null,
        approximateReceiptQuantity: null,
        orderPlaced: true,
        receiptArrived: false,
        skuId: ' sku-4 ',
      }],
      servicePrices: [{ price: 12, serviceId: ' service-3 ' }],
      retailPrices: [{ price: 9, skuId: ' sku-5 ' }],
      leadTimeHints: [{
        highDays: null,
        lowDays: null,
        skuId: ' sku-6 ',
        typicalDays: null,
        variabilityClass: null,
      }],
      adjustmentSignals: [{ quantityDelta: 1, reason: 'count', skuId: ' sku-7 ' }],
      commercialEvents: [{
        entityId: ' sku-8 ',
        entityType: 'sku',
        flow: 'scheduled',
        party: 'customer',
        quantityDelta: 1,
        stage: 'pending',
      }],
      ticketEvents: [{
        deliveryFee: {
          bucket: 'customer_order',
          displayDeliveryUsd: 2,
          displayTotalUsd: 12,
          feeUsd: 2,
          netSettlementUsd: -10,
          payer: 'customer',
          subtotalUsd: 10,
        },
        discount: {
          amountUsd: 1,
          discountedSubtotalUsd: 9,
          displayDiscountUsd: 1,
          mode: 'amount',
          percent: null,
          subtotalUsd: 10,
        },
        eventType: 'created',
        lifecycle: 'open',
        lines: [{
          entityId: ' service-4 ',
          entityType: 'service',
          expectedArrivalAt: ' 2026-04-05T00:00:00Z ',
          promisedAt: ' 2026-04-04T00:00:00Z ',
          unitCost: 3,
        }],
        nextTouchAt: ' 2026-04-03T00:00:00Z ',
        occurredAt: ' 2026-04-02T00:00:00Z ',
        revision: 1,
        stage: 'pending',
        ticketFamily: 'customer',
        ticketId: ' ticket-1 ',
      }],
      recipeUsageHints: [{
        serviceId: ' service-5 ',
        skuId: ' sku-9 ',
        typicalUnitsPerInstance: 1,
        usageProbability: 0.5,
        variability: 0,
      }],
      notes: null,
    });

    expect(normalized.stockSnapshot[0]?.skuId).toBe('sku-1');
    expect(normalized.retailSalesSnapshot?.[0]?.skuId).toBe('sku-2');
    expect(normalized.serviceSalesSnapshot?.[0]?.serviceId).toBe('service-1');
    expect(normalized.serviceRankings).toEqual(['service-1']);
    expect(normalized.retailRankings).toEqual(['sku-1']);
    expect(normalized.serviceStockouts).toEqual(['service-2']);
    expect(normalized.retailStockouts).toEqual(['sku-3']);
    expect(normalized.orderSignals[0]?.skuId).toBe('sku-4');
    expect(normalized.servicePrices[0]?.serviceId).toBe('service-3');
    expect(normalized.retailPrices[0]?.skuId).toBe('sku-5');
    expect(normalized.leadTimeHints[0]?.skuId).toBe('sku-6');
    expect(normalized.adjustmentSignals?.[0]?.skuId).toBe('sku-7');
    expect(normalized.commercialEvents?.[0]?.entityId).toBe('sku-8');
    expect(normalized.ticketEvents?.[0]?.ticketId).toBe('ticket-1');
    expect(normalized.ticketEvents?.[0]?.occurredAt).toBe('2026-04-02T00:00:00Z');
    expect(normalized.ticketEvents?.[0]?.nextTouchAt).toBe('2026-04-03T00:00:00Z');
    expect(normalized.ticketEvents?.[0]?.lines[0]?.entityId).toBe('service-4');
    expect(normalized.ticketEvents?.[0]?.lines[0]?.promisedAt).toBe('2026-04-04T00:00:00Z');
    expect(normalized.ticketEvents?.[0]?.lines[0]?.expectedArrivalAt).toBe('2026-04-05T00:00:00Z');
    expect(normalized.recipeUsageHints?.[0]).toMatchObject({
      serviceId: 'service-5',
      skuId: 'sku-9',
    });
  });
});
